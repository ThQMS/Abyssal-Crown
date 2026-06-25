import { describe, it, expect } from 'vitest';
import { RNG } from '@/utils/RNG';

describe('RNG', () => {
  it('é determinística: mesma seed → mesma sequência', () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('seeds diferentes → sequências diferentes', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('nextInt respeita os limites inclusivos', () => {
    const rng = new RNG(99);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('next() fica em [0, 1)', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
