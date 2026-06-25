import { Chest } from '@/entities/Chest';
import { Enemy } from '@/entities/Enemy';
import { Inscription } from '@/entities/Inscription';
import { RoomType } from '@/types';
import { rectCenter, rectsOverlap } from '@/utils/MathUtils';
import type { RNG } from '@/utils/RNG';
import type { EnemyDefinition, LoreEntry, Point, Rect, RoomTypeName } from '@/types';

import enemiesData from '@/data/enemies.json';
import itemsData from '@/data/items.json';
import loreData from '@/data/lore.json';
import puzzlesData from '@/data/puzzles.json';

/** Um puzzle do catálogo, reduzido ao que a geração precisa para sortear. */
export interface PuzzleRef {
  id: string;
  floor: number;
}

export interface RoomPopulateContext {
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

/**
 * Sala retangular gerada pelo BSP. Alem da geometria, carrega o conteudo que
 * sera promovido para as listas do DungeonLevel depois do populate().
 */
export class Room implements Rect {
  bounds: Rect;
  type: RoomTypeName;
  id: string;
  enemies: Enemy[] = [];
  inscriptions: Inscription[] = [];
  chest: Chest | null = null;
  cleared = false;
  puzzleSolved = false;
  connected = false;

  constructor(x: number, y: number, width: number, height: number, type: RoomTypeName = RoomType.Normal) {
    this.bounds = { x, y, width, height };
    this.type = type;
    this.id = `room_${x}_${y}_${width}_${height}`;
  }

  get x(): number {
    return this.bounds.x;
  }

  set x(value: number) {
    this.bounds.x = value;
  }

  get y(): number {
    return this.bounds.y;
  }

  set y(value: number) {
    this.bounds.y = value;
  }

  get width(): number {
    return this.bounds.width;
  }

  set width(value: number) {
    this.bounds.width = value;
  }

  get height(): number {
    return this.bounds.height;
  }

  set height(value: number) {
    this.bounds.height = value;
  }

  get center(): Point {
    return rectCenter(this.bounds);
  }

  get area(): number {
    return this.width * this.height;
  }

  populate(floor: number, rng: RNG, context: RoomPopulateContext = DEFAULT_CONTEXT): void {
    this.enemies.length = 0;
    this.inscriptions.length = 0;
    this.chest = null;
    this.cleared = false;
    this.puzzleSolved = false;

    switch (this.type) {
      case RoomType.Normal:
      case RoomType.Combat:
        this.addEnemies(rng.nextInt(1, 3), floor, rng, context);
        if (rng.nextBool(0.2)) this.addChest(rng, context, false);
        break;
      case RoomType.Elite:
        this.addEnemies(rng.nextInt(2, 4), floor + 2, rng, context);
        this.addChest(rng, context, false);
        break;
      case RoomType.Puzzle:
        this.addPuzzleInscription(floor, rng, context);
        break;
      case RoomType.Boss:
        this.addBoss(floor, rng, context);
        break;
      case RoomType.Treasure:
        this.addChest(rng, context, true);
        break;
      case RoomType.Shrine:
        this.addSaveShrine(rng);
        break;
      default:
        break;
    }
  }

  randomInteriorTile(rand: () => number): Point {
    const x = this.x + 1 + Math.floor(rand() * Math.max(1, this.width - 2));
    const y = this.y + 1 + Math.floor(rand() * Math.max(1, this.height - 2));
    return { x, y };
  }

  overlaps(other: Rect, margin = 1): boolean {
    return rectsOverlap(this.bounds, other, margin);
  }

  private addEnemies(count: number, floor: number, rng: RNG, context: RoomPopulateContext): void {
    const pool = this.enemyPoolForFloor(floor, context);
    for (let i = 0; i < count && pool.length > 0; i++) {
      const tile = this.randomFreeInteriorTile(rng);
      const def = rng.pick(pool);
      this.enemies.push(new Enemy(tile.x, tile.y, def));
    }
  }

  private addBoss(floor: number, rng: RNG, context: RoomPopulateContext): void {
    if (floor !== 10 && context.enemyPool.length === 0) return;
    const boss =
      context.enemyPool.find((e) => e.id === 'big_demon') ??
      context.enemyPool[context.enemyPool.length - 1];
    if (!boss) return;
    const tile = this.randomFreeInteriorTile(rng);
    this.enemies.push(new Enemy(tile.x, tile.y, boss));
  }

  private addPuzzleInscription(floor: number, rng: RNG, context: RoomPopulateContext): void {
    const puzzleId = puzzleForFloor(floor, context.puzzlePool, rng);
    if (!puzzleId) return;
    const lore = context.lorePool[0] ?? {
      id: `floor_${floor}_puzzle`,
      title: `Terminal do Andar ${floor}`,
      body: 'Uma inscricao antiga pulsa sobre a pedra.',
    };
    const tile = this.randomFreeInteriorTile(rng);
    this.inscriptions.push(new Inscription(tile.x, tile.y, lore, puzzleId));
  }

  private addChest(rng: RNG, context: RoomPopulateContext, big: boolean): void {
    if (context.itemPool.length === 0) return;
    const tile = this.randomFreeInteriorTile(rng);
    const count = big ? Math.min(3, context.itemPool.length) : 1;
    const loot: string[] = [];
    for (let i = 0; i < count; i++) loot.push(rng.pick(context.itemPool));
    this.chest = new Chest(tile.x, tile.y, loot);
  }

  private addSaveShrine(rng: RNG): void {
    const tile = this.randomFreeInteriorTile(rng);
    this.inscriptions.push(
      new Inscription(
        tile.x,
        tile.y,
        {
          id: 'save_shrine',
          title: 'Santuário de Respiro',
          speaker: 'Pedra morna',
          body: 'A chama baixa deste santuário guarda sua memória e fecha suas feridas por um instante.',
        },
      ),
    );
  }

  private randomFreeInteriorTile(rng: RNG): Point {
    for (let tries = 0; tries < 32; tries++) {
      const tile = this.randomInteriorTile(() => rng.next());
      if (!this.isOccupied(tile)) return tile;
    }
    return this.center;
  }

  private isOccupied(point: Point): boolean {
    if (this.chest?.isAt(point.x, point.y)) return true;
    if (this.enemies.some((e) => e.isAt(point.x, point.y))) return true;
    return this.inscriptions.some((i) => i.isAt(point.x, point.y));
  }

  private enemyPoolForFloor(floor: number, context: RoomPopulateContext): EnemyDefinition[] {
    const maxLevel = Math.max(1, floor + 2);
    const eligible = context.enemyPool.filter((enemy) => enemy.stats.level <= maxLevel);
    return eligible.length > 0 ? eligible : context.enemyPool;
  }
}

/**
 * Sorteia um puzzle do andar. Usa o RNG (semeado) da geração, então a escolha é
 * "aleatória" para o jogador mas reproduzível ao regenerar o andar — essencial
 * para o rastreio de resolvidos e o destravar das escadas. Cai no pool inteiro
 * se o andar não tiver puzzles próprios.
 */
function puzzleForFloor(floor: number, puzzlePool: PuzzleRef[], rng: RNG): string | undefined {
  if (puzzlePool.length === 0) return undefined;
  const onFloor = puzzlePool.filter((p) => p.floor === floor);
  const pool = onFloor.length > 0 ? onFloor : puzzlePool;
  return rng.pick(pool).id;
}
