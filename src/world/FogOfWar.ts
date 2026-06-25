import { FogState } from '@/types';
import type { TileMap } from '@/world/TileMap';
import type { Point } from '@/types';

/**
 * Controla a nevoa de guerra em duas camadas:
 *  - visible: tiles iluminados no frame atual de FOV
 *  - discovered: tiles ja vistos ao menos uma vez
 */
export class FogOfWar {
  readonly width: number;
  readonly height: number;
  private readonly visible: Uint8Array;
  private readonly discovered: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.visible = new Uint8Array(width * height);
    this.discovered = new Uint8Array(width * height);
  }

  isVisible(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.visible[y * this.width + x] === 1;
  }

  isDiscovered(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    return this.discovered[i] === 1 || this.visible[i] === 1;
  }

  revealAll(): void {
    this.visible.fill(1);
    this.discovered.fill(1);
  }

  /** Serializa os tiles descobertos como base64 (para o save). */
  serializeDiscovered(): string {
    let binary = '';
    for (let i = 0; i < this.discovered.length; i++) {
      binary += String.fromCharCode(this.discovered[i] as number);
    }
    return btoa(binary);
  }

  /**
   * Restaura os tiles descobertos de um save, unindo ao que já está revelado, e
   * marca-os como `Explored` no mapa (para o minimapa e o desenho esmaecido).
   */
  applyDiscovered(base64: string, tilemap: TileMap): void {
    try {
      const binary = atob(base64);
      const count = Math.min(binary.length, this.discovered.length);
      for (let i = 0; i < count; i++) {
        if (binary.charCodeAt(i) !== 1) continue;
        this.discovered[i] = 1;
        const x = i % this.width;
        const y = Math.floor(i / this.width);
        const tile = tilemap.get(x, y);
        if (tile && tile.fogState === FogState.Hidden) tile.fogState = FogState.Explored;
      }
    } catch {
      /* base64 inválido: ignora e mantém a névoa atual */
    }
  }

  compute(tilemap: TileMap, origin: Point, radius: number): void {
    this.promoteVisibleToExplored(tilemap);
    this.markVisible(tilemap, origin.x, origin.y);

    for (let octant = 0; octant < 8; octant++) {
      this.castLight(tilemap, origin, radius, 1, 1, 0, octant);
    }
  }

  /** Alias mantido para chamadas existentes. */
  computeFrom(tilemap: TileMap, origin: Point, radius: number): void {
    this.compute(tilemap, origin, radius);
  }

  private promoteVisibleToExplored(tilemap: TileMap): void {
    for (let i = 0; i < this.visible.length; i++) {
      if (this.visible[i] === 1) {
        this.discovered[i] = 1;
        const x = i % this.width;
        const y = Math.floor(i / this.width);
        const tile = tilemap.get(x, y);
        if (tile) tile.fogState = FogState.Explored;
      }
      this.visible[i] = 0;
    }
  }

  private markVisible(tilemap: TileMap, x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    this.visible[i] = 1;
    this.discovered[i] = 1;
    const tile = tilemap.get(x, y);
    if (tile) tile.fogState = FogState.Visible;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /**
   * Shadowcasting recursivo classico de Bjorn Bergstrom para um octante.
   */
  private castLight(
    tilemap: TileMap,
    origin: Point,
    radius: number,
    row: number,
    startSlope: number,
    endSlope: number,
    octant: number,
  ): void {
    if (startSlope < endSlope) return;

    const radiusSquared = radius * radius;
    let nextStartSlope = startSlope;
    let blocked = false;

    for (let distance = row; distance <= radius && !blocked; distance++) {
      const dy = -distance;

      for (let dx = -distance; dx <= 0; dx++) {
        const leftSlope = (dx - 0.5) / (dy + 0.5);
        const rightSlope = (dx + 0.5) / (dy - 0.5);

        if (rightSlope > startSlope) continue;
        if (leftSlope < endSlope) break;

        const [mapX, mapY] = transformOctant(dx, dy, origin, octant);
        if (dx * dx + dy * dy <= radiusSquared) {
          this.markVisible(tilemap, mapX, mapY);
        }

        const opaque = tilemap.isOpaque(mapX, mapY);
        if (blocked) {
          if (opaque) {
            nextStartSlope = rightSlope;
            continue;
          }
          blocked = false;
          startSlope = nextStartSlope;
        } else if (opaque && distance < radius) {
          blocked = true;
          this.castLight(tilemap, origin, radius, distance + 1, startSlope, leftSlope, octant);
          nextStartSlope = rightSlope;
        }
      }
    }
  }
}

function transformOctant(dx: number, dy: number, origin: Point, octant: number): [number, number] {
  switch (octant) {
    case 0:
      return [origin.x + dx, origin.y + dy];
    case 1:
      return [origin.x + dy, origin.y + dx];
    case 2:
      return [origin.x - dy, origin.y + dx];
    case 3:
      return [origin.x - dx, origin.y + dy];
    case 4:
      return [origin.x - dx, origin.y - dy];
    case 5:
      return [origin.x - dy, origin.y - dx];
    case 6:
      return [origin.x + dy, origin.y - dx];
    default:
      return [origin.x + dx, origin.y - dy];
  }
}
