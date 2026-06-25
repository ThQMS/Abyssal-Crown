import { describe, it, expect } from 'vitest';
import { DamageCalculator } from '@/combat/DamageCalculator';
import { normalizeStats } from '@/entities/Entity';
import { RNG } from '@/utils/RNG';
import type { Stats } from '@/types';

function statsWith(overrides: Partial<Stats>): Stats {
  return normalizeStats(overrides);
}

describe('DamageCalculator', () => {
  it('ataque físico escala por atk (e não por magic)', () => {
    const fraco = statsWith({ atk: 5, magic: 50 });
    const forte = statsWith({ atk: 50, magic: 5 });
    const alvo = statsWith({ def: 0, resistance: 0, hp: 999, maxHp: 999 });
    const skill = { power: 1, element: 'physical' as const };

    const rng = () => new RNG(1);
    const dFraco = DamageCalculator.calculate({ stats: fraco }, { stats: alvo }, skill, rng()).damage;
    const dForte = DamageCalculator.calculate({ stats: forte }, { stats: alvo }, skill, rng()).damage;
    expect(dForte).toBeGreaterThan(dFraco);
  });

  it('ataque mágico escala por magic (a stat magic finalmente importa)', () => {
    const fraco = statsWith({ atk: 50, magic: 5 });
    const forte = statsWith({ atk: 5, magic: 50 });
    const alvo = statsWith({ def: 0, resistance: 0, hp: 999, maxHp: 999 });
    const skill = { power: 1, element: 'fire' as const };

    const dFraco = DamageCalculator.calculate({ stats: fraco }, { stats: alvo }, skill, new RNG(1)).damage;
    const dForte = DamageCalculator.calculate({ stats: forte }, { stats: alvo }, skill, new RNG(1)).damage;
    expect(dForte).toBeGreaterThan(dFraco);
  });

  it('é determinística com a mesma RNG semeada', () => {
    const atk = statsWith({ atk: 20 });
    const def = statsWith({ def: 5, hp: 999, maxHp: 999 });
    const skill = { power: 1.5, element: 'physical' as const };
    const a = DamageCalculator.calculate({ stats: atk }, { stats: def }, skill, new RNG(42));
    const b = DamageCalculator.calculate({ stats: atk }, { stats: def }, skill, new RNG(42));
    expect(a).toEqual(b);
  });

  it('dano nunca é menor que 1', () => {
    const fraco = statsWith({ atk: 1 });
    const tanque = statsWith({ def: 9999, hp: 999, maxHp: 999 });
    const skill = { power: 1, element: 'physical' as const };
    const d = DamageCalculator.calculate({ stats: fraco }, { stats: tanque }, skill, new RNG(3)).damage;
    expect(d).toBeGreaterThanOrEqual(1);
  });
});
