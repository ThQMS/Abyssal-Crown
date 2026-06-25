/**
 * Deterministic seedable pseudo-random number generator (mulberry32).
 *
 * Determinism matters: dungeon generation, loot, and enemy placement all draw
 * from a single seeded stream so a saved `seed` reproduces the same run.
 */
export class RNG {
  private state: number;

  constructor(seed: number = 0x9e3779b9) {
    // Force to an unsigned 32-bit integer.
    this.state = seed >>> 0;
  }

  /** The current internal state, useful for persistence. */
  get seed(): number {
    return this.state >>> 0;
  }

  /** Returns a float in the half-open range [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in the inclusive range [min, max]. */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Backwards-compatible alias for nextInt. */
  int(min: number, max: number): number {
    return this.nextInt(min, max);
  }

  /** Returns a float in the half-open range [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Returns true with the given probability (0..1). */
  nextBool(probability: number): boolean {
    return this.next() < probability;
  }

  /** Backwards-compatible alias for nextBool. */
  chance(probability: number): boolean {
    return this.nextBool(probability);
  }

  /** Picks a uniformly random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('RNG.pick called with an empty array');
    }
    return items[this.nextInt(0, items.length - 1)] as T;
  }

  /** Returns a new array shuffled with Fisher–Yates (non-mutating). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** Forks a new independent generator derived from the current state. */
  fork(): RNG {
    return new RNG(this.nextInt(0, 0xffffffff));
  }
}
