import { describe, it, expect } from 'vitest';
import { TileMap } from '@/world/TileMap';
import { BSPGenerator } from '@/world/BSPGenerator';
import { Tile } from '@/world/Tile';
import { TileType } from '@/types';

describe('TileMap', () => {
  it('findPath acha um caminho num corredor reto', () => {
    const map = new TileMap(5, 1, TileType.Floor);
    const path = map.findPath({ x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path.length).toBe(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('findPath retorna [] quando o alvo é inacessível', () => {
    const map = new TileMap(3, 1, TileType.Floor);
    map.set(1, 0, new Tile(TileType.Wall)); // muro no meio bloqueia
    expect(map.findPath({ x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([]);
  });

  it('hasLineOfSight é bloqueada por tiles opacos', () => {
    const map = new TileMap(5, 1, TileType.Floor);
    expect(map.hasLineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    map.set(2, 0, new Tile(TileType.Wall));
    expect(map.hasLineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });
});

describe('BSPGenerator', () => {
  it('é determinístico: mesma seed → mesmo mapa', () => {
    const a = new BSPGenerator().generate(48, 32, 777);
    const b = new BSPGenerator().generate(48, 32, 777);
    let equal = true;
    a.forEach((tile, x, y) => {
      if (b.get(x, y)?.type !== tile.type) equal = false;
    });
    expect(equal).toBe(true);
  });

  it('gera salas e todas são alcançáveis a partir da primeira (masmorra jogável)', () => {
    for (const seed of [1, 2, 3, 42, 1000]) {
      const gen = new BSPGenerator();
      const map = gen.generate(64, 48, seed);
      expect(gen.rooms.length).toBeGreaterThan(0);

      // Flood fill (BFS) sobre tiles passáveis, sem o teto de nós do A*.
      const reachable = floodFill(map, gen.rooms[0]!.center);
      for (const room of gen.rooms) {
        const c = room.center;
        expect(reachable.has(`${c.x},${c.y}`), `seed ${seed}: sala inacessível`).toBe(true);
      }
    }
  });
});

function floodFill(map: TileMap, start: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const [nx, ny] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !map.isPassable(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}
