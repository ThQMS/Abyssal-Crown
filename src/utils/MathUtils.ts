import type { Vec2, Rect } from '@/types';

/** Clamps `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linear interpolation between `a` and `b` by `t` (0..1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp: returns where `value` sits between `a` and `b` as 0..1. */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return clamp((value - a) / (b - a), 0, 1);
}

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Manhattan (grid) distance between two points. */
export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

/** Chebyshev (king-move) distance between two points. */
export function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** True if the two integer coordinates are equal. */
export function vecEquals(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Adds two vectors, returning a new vector. */
export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** True if `point` lies within `rect` (inclusive of the top-left edge). */
export function rectContains(rect: Rect, point: Vec2): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

/** True if two rectangles overlap, optionally padded by `margin`. */
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x - margin < b.x + b.width &&
    a.x + a.width + margin > b.x &&
    a.y - margin < b.y + b.height &&
    a.y + a.height + margin > b.y
  );
}

/** The integer center point of a rectangle. */
export function rectCenter(rect: Rect): Vec2 {
  return {
    x: Math.floor(rect.x + rect.width / 2),
    y: Math.floor(rect.y + rect.height / 2),
  };
}
