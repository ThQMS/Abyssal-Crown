import { TileMap } from '@/world/TileMap';
import { Room } from '@/world/Room';
import { BSPGenerator } from '@/world/BSPGenerator';
import { FogOfWar } from '@/world/FogOfWar';
import { Enemy } from '@/entities/Enemy';
import { Chest } from '@/entities/Chest';
import { Inscription } from '@/entities/Inscription';
import { RoomType, TileType } from '@/types';
import { distance } from '@/utils/MathUtils';
import { RNG } from '@/utils/RNG';
import { themeForDepth, type DungeonTheme } from '@/world/Theme';
import type { PuzzleRef, RoomPopulateContext } from '@/world/Room';
import type { Entity } from '@/entities/Entity';
import type { EnemyDefinition, LoreEntry, Point } from '@/types';

import enemiesData from '@/data/enemies.json';
import itemsData from '@/data/items.json';
import loreData from '@/data/lore.json';
import puzzlesData from '@/data/puzzles.json';

export interface SpawnContext {
  enemyPool: EnemyDefinition[];
  lorePool: LoreEntry[];
  puzzlePool: PuzzleRef[];
  itemPool: string[];
}

const DEFAULT_CONTEXT: RoomPopulateContext = {
  enemyPool: enemiesData as EnemyDefinition[],
  lorePool: loreData as LoreEntry[],
  puzzlePool: (puzzlesData as PuzzleRef[]).map((p) => ({ id: p.id, floor: p.floor })),
  itemPool: (itemsData as { id: string }[]).map((i) => i.id),
};

/** Um andar completo: geometria, salas, entidades e nevoa de guerra. */
export class DungeonLevel {
  readonly floor: number;
  readonly depth: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;

  tilemap!: TileMap;
  map!: TileMap;
  rooms: Room[] = [];
  startRoom!: Room;
  exitRoom!: Room;
  puzzleRoom!: Room;
  fog!: FogOfWar;

  entrance: Point = { x: 0, y: 0 };
  exit: Point = { x: 0, y: 0 };
  requiredPuzzleId?: string;
  stairsLocked = true;
  /** Bioma/aparência deste andar (varia conforme a profundidade). */
  readonly theme: DungeonTheme;

  readonly enemies: Enemy[] = [];
  readonly chests: Chest[] = [];
  readonly inscriptions: Inscription[] = [];

  constructor(floor: number, _runRng?: RNG, width = 64, height = 48) {
    this.floor = floor;
    this.depth = floor;
    this.seed = floor * 99991 + 12345;
    this.width = width;
    this.height = height;
    this.theme = themeForDepth(floor);
    this.generate();
  }

  generate(context: RoomPopulateContext = DEFAULT_CONTEXT): void {
    const generator = new BSPGenerator();
    this.tilemap = generator.generate(this.width, this.height, this.seed);
    this.map = this.tilemap;
    this.rooms = generator.rooms.length > 0 ? [...generator.rooms] : [new Room(1, 1, 5, 5)];
    this.fog = new FogOfWar(this.width, this.height);
    this.stairsLocked = true;

    this.assignRoomTypes();
    this.populateRooms(context);
    this.placeSpecialTiles();
  }

  /** Compatibilidade com o fluxo antigo: repopula sem regenerar geometria. */
  populate(_rng: RNG, context: SpawnContext): void {
    this.populateRooms(context);
    this.placeSpecialTiles();
  }

  placeSpecialTiles(): void {
    this.entrance = this.startRoom.center;
    this.exit = this.exitRoom.center;
    this.tilemap.set(this.entrance.x, this.entrance.y, TileType.StairsUp);
    this.tilemap.set(this.exit.x, this.exit.y, TileType.StairsDown);

    const inscription = this.puzzleRoom.inscriptions[0];
    this.requiredPuzzleId = inscription?.puzzleId;
  }

  unlockStairs(): void {
    this.stairsLocked = false;
    this.exitRoom.puzzleSolved = true;
    this.tilemap.set(this.exit.x, this.exit.y, TileType.StairsDown);
  }

  floorVariantAt(x: number, y: number): number {
    const tile = this.tilemap.get(x, y);
    if (!tile || tile.type !== TileType.Floor) return 1;
    return (tile.variant % 3) + 1;
  }

  get entities(): Entity[] {
    return [...this.inscriptions, ...this.chests, ...this.enemies];
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    return this.entities.find((e) => e.blocking && !e.dead && e.isAt(x, y));
  }

  enemyAt(x: number, y: number): Enemy | undefined {
    return this.enemies.find((e) => !e.dead && e.isAt(x, y));
  }

  interactableAt(x: number, y: number): Chest | Inscription | undefined {
    return (
      this.chests.find((c) => c.isAt(x, y)) ?? this.inscriptions.find((i) => i.isAt(x, y))
    );
  }

  canWalk(x: number, y: number): boolean {
    if (this.stairsLocked && x === this.exit.x && y === this.exit.y) return false;
    return this.tilemap.isWalkable(x, y) && !this.blockingEntityAt(x, y);
  }

  revealAround(origin: Point, radius = 8): void {
    this.fog.compute(this.tilemap, origin, radius);
  }

  /** Captura o progresso mutável deste andar (inimigos vivos, baús, névoa). */
  serializeProgress(): import('@/types').FloorProgress {
    return {
      livingEnemies: this.enemies.filter((e) => !e.dead).map((e) => e.spawnKey),
      openedChests: this.chests.filter((c) => c.opened).map((c) => `${c.x},${c.y}`),
      discovered: this.fog.serializeDiscovered(),
    };
  }

  /** Reaplica um progresso salvo: poda inimigos derrotados, abre baús, revela névoa. */
  restoreProgress(progress: import('@/types').FloorProgress): void {
    const living = new Set(progress.livingEnemies);
    for (const enemy of this.enemies) {
      if (!living.has(enemy.spawnKey)) {
        enemy.dead = true;
        enemy.stats.hp = 0;
      }
    }
    this.removeDeadEnemies();

    const opened = new Set(progress.openedChests);
    for (const chest of this.chests) {
      if (opened.has(`${chest.x},${chest.y}`)) chest.markOpened();
    }

    this.fog.applyDiscovered(progress.discovered, this.tilemap);
  }

  removeDeadEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i]?.dead) this.enemies.splice(i, 1);
    }
    for (const room of this.rooms) {
      room.enemies = room.enemies.filter((enemy) => !enemy.dead);
      room.cleared = room.enemies.length === 0;
    }
  }

  private assignRoomTypes(): void {
    for (const room of this.rooms) room.type = RoomType.Normal;

    this.startRoom = this.rooms[0] as Room;
    this.exitRoom = (this.rooms[this.rooms.length - 1] ?? this.startRoom) as Room;
    this.startRoom.type = RoomType.Start;
    this.exitRoom.type = RoomType.Exit;

    const puzzleCandidate = this.pickFarthestRoom(this.startRoom, [this.startRoom, this.exitRoom]);
    this.puzzleRoom = puzzleCandidate;
    if (this.puzzleRoom !== this.startRoom && this.puzzleRoom !== this.exitRoom) {
      this.puzzleRoom.type = RoomType.Puzzle;
    }

    const rng = new RNG(this.seed ^ 0xa5a5a5a5);
    const candidates = this.rooms.filter(
      (room) => room.type === RoomType.Normal && room !== this.startRoom && room !== this.exitRoom,
    );

    if (this.floor === 10) {
      const bossRoom = this.takeRandomRoom(candidates, rng);
      if (bossRoom) bossRoom.type = RoomType.Boss;
    }

    const eliteRoom = this.takeRandomRoom(candidates, rng);
    if (eliteRoom) eliteRoom.type = RoomType.Elite;

    const treasureRoom = this.takeRandomRoom(candidates, rng);
    if (treasureRoom) treasureRoom.type = RoomType.Treasure;

    const shrineRoom = this.takeRandomRoom(candidates, rng);
    if (shrineRoom) shrineRoom.type = RoomType.Shrine;
  }

  private populateRooms(context: RoomPopulateContext): void {
    const rng = new RNG(this.seed ^ 0x6d2b79f5);
    this.enemies.length = 0;
    this.chests.length = 0;
    this.inscriptions.length = 0;

    for (const room of this.rooms) {
      room.populate(this.floor, rng, context);
      this.enemies.push(...room.enemies);
      this.inscriptions.push(...room.inscriptions);
      if (room.chest) this.chests.push(room.chest);
    }
  }

  private pickFarthestRoom(from: Room, excluded: Room[]): Room {
    let best = this.rooms.find((room) => !excluded.includes(room)) ?? from;
    let bestDistance = -1;
    for (const room of this.rooms) {
      if (excluded.includes(room)) continue;
      const d = distance(from.center, room.center);
      if (d > bestDistance) {
        best = room;
        bestDistance = d;
      }
    }
    return best;
  }

  private takeRandomRoom(rooms: Room[], rng: RNG): Room | undefined {
    if (rooms.length === 0) return undefined;
    const index = rng.nextInt(0, rooms.length - 1);
    const room = rooms[index];
    if (!room) return undefined;
    rooms.splice(index, 1);
    return room;
  }
}
