import { Tile } from '@/world/Tile';
import { TileType } from '@/types';
import type { TileTypeName, Point } from '@/types';

/** Limite de nos expandidos pelo A* antes de desistir. */
const MAX_PATH_NODES = 200;

/**
 * Grade densa de {@link Tile}s. Coordenadas em unidades de tile; a renderizacao
 * fica a cargo de camadas superiores (estados / camera).
 */
export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];

  constructor(width: number, height: number, fill: TileTypeName = TileType.Void) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = new Tile(fill);
    }
  }

  /** Verdadeiro se (x, y) esta dentro dos limites. */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Tile em (x, y), ou `null` se fora dos limites. */
  get(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[y * this.width + x] ?? null;
  }

  /** Define o tile em (x, y). Aceita um Tile pronto ou um tipo (cria o Tile). */
  set(x: number, y: number, tile: Tile | TileTypeName): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.width + x] = tile instanceof Tile ? tile : new Tile(tile);
  }

  /** Verdadeiro se o tile em (x, y) permite movimento. */
  isPassable(x: number, y: number): boolean {
    const tile = this.get(x, y);
    return tile ? tile.passable : false;
  }

  /** Verdadeiro se o tile em (x, y) bloqueia a linha de visao. */
  isOpaque(x: number, y: number): boolean {
    const tile = this.get(x, y);
    // Fora dos limites conta como parede (bloqueia a visao).
    return tile ? tile.opaque : true;
  }

  /** Alias de compatibilidade com codigo que usa `isWalkable`. */
  isWalkable(x: number, y: number): boolean {
    return this.isPassable(x, y);
  }

  /** Executa `fn` para cada tile da grade. */
  forEach(fn: (tile: Tile, x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y * this.width + x];
        if (tile) fn(tile, x, y);
      }
    }
  }

  /**
   * A* de 4 direcoes com heuristica de Manhattan. Limitado a
   * {@link MAX_PATH_NODES} nos expandidos; retorna o caminho de `from` ate `to`
   * (inclusive) ou `[]` se nao houver caminho dentro do orcamento.
   */
  findPath(from: Point, to: Point): Point[] {
    if (!this.isPassable(to.x, to.y) || !this.isPassable(from.x, from.y)) return [];

    const startKey = key(from.x, from.y);
    const goalKey = key(to.x, to.y);

    const open = new Set<string>([startKey]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);
    const fScore = new Map<string, number>([[startKey, manhattan(from, to)]]);

    let expanded = 0;
    while (open.size > 0 && expanded < MAX_PATH_NODES) {
      // Seleciona o no aberto de menor fScore.
      let currentKey = '';
      let best = Infinity;
      for (const k of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < best) {
          best = f;
          currentKey = k;
        }
      }
      if (currentKey === goalKey) return reconstruct(cameFrom, currentKey);

      open.delete(currentKey);
      expanded++;
      const [cx, cy] = parse(currentKey);
      const baseG = gScore.get(currentKey) ?? Infinity;

      for (const [nx, ny] of neighbors(cx, cy)) {
        if (!this.isPassable(nx, ny)) continue;
        const nKey = key(nx, ny);
        const tentative = baseG + 1;
        if (tentative < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, currentKey);
          gScore.set(nKey, tentative);
          fScore.set(nKey, tentative + manhattan({ x: nx, y: ny }, to));
          open.add(nKey);
        }
      }
    }

    return [];
  }

  /**
   * Linha de visao via Bresenham: verdadeiro se nenhum tile opaco fica
   * estritamente entre `from` e `to` (o proprio alvo pode ser uma parede e
   * ainda assim ser visivel).
   */
  hasLineOfSight(from: Point, to: Point): boolean {
    let x0 = from.x;
    let y0 = from.y;
    const x1 = to.x;
    const y1 = to.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (x0 !== x1 || y0 !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
      // Chegou ao alvo: visivel mesmo que o alvo seja opaco.
      if (x0 === x1 && y0 === y1) break;
      if (this.isOpaque(x0, y0)) return false;
    }
    return true;
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function parse(k: string): [number, number] {
  const comma = k.indexOf(',');
  return [Number(k.slice(0, comma)), Number(k.slice(comma + 1))];
}

function neighbors(x: number, y: number): [number, number][] {
  return [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
  ];
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstruct(cameFrom: Map<string, string>, goalKey: string): Point[] {
  const path: Point[] = [];
  let cursor: string | undefined = goalKey;
  while (cursor) {
    const [x, y] = parse(cursor);
    path.unshift({ x, y });
    cursor = cameFrom.get(cursor);
  }
  return path;
}
