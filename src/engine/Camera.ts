import { clamp, lerp } from '@/utils/MathUtils';
import type { Vec2 } from '@/types';

/**
 * A 2D camera mapping tile/world coordinates to canvas pixels. Smoothly follows
 * a target and clamps to the world bounds so it never shows the void past the
 * edge of a level.
 */
export class Camera {
  /** Top-left of the view, in world pixels. */
  x = 0;
  y = 0;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  zoom = 1;

  private worldWidth = Infinity;
  private worldHeight = Infinity;
  /** Follow smoothing (0 = locked, 1 = instant). */
  private readonly lerpFactor = 0.18;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  /** Sets world pixel bounds used for clamping. */
  setWorldBounds(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  /** Eases the camera so `target` (world px) sits at the viewport center. */
  follow(target: Vec2): void {
    const destX = target.x - this.viewportWidth / (2 * this.zoom);
    const destY = target.y - this.viewportHeight / (2 * this.zoom);
    this.x = lerp(this.x, destX, this.lerpFactor);
    this.y = lerp(this.y, destY, this.lerpFactor);
    this.clampToWorld();
  }

  /** Snaps instantly to center on `target` (used on level load). */
  snapTo(target: Vec2): void {
    this.x = target.x - this.viewportWidth / (2 * this.zoom);
    this.y = target.y - this.viewportHeight / (2 * this.zoom);
    this.clampToWorld();
  }

  /** World → screen. */
  worldToScreen(point: Vec2): Vec2 {
    return {
      x: (point.x - this.x) * this.zoom,
      y: (point.y - this.y) * this.zoom,
    };
  }

  /** Screen → world. */
  screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x / this.zoom + this.x,
      y: point.y / this.zoom + this.y,
    };
  }

  private clampToWorld(): void {
    const maxX = Math.max(0, this.worldWidth - this.viewportWidth / this.zoom);
    const maxY = Math.max(0, this.worldHeight - this.viewportHeight / this.zoom);
    if (Number.isFinite(this.worldWidth)) this.x = clamp(this.x, 0, maxX);
    if (Number.isFinite(this.worldHeight)) this.y = clamp(this.y, 0, maxY);
  }
}
