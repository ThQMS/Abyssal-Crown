import { describe, expect, it } from 'vitest';
import { skillsForClass } from '@/combat/SkillTree';
import { Minion } from '@/entities/Minion';
import type { ClassDefinition, SkillDefinition } from '@/types';

import skillsData from '@/data/skills.json';
import classesData from '@/data/classes.json';

const SKILLS = skillsData as SkillDefinition[];
const CLASSES = classesData as ClassDefinition[];

function classSkillIds(classId: string): Set<string> {
  const klass = CLASSES.find((c) => c.id === classId) as ClassDefinition;
  return new Set(skillsForClass(SKILLS, klass.startingSkills).map((d) => d.id));
}

describe('skillsForClass', () => {
  it('gives the knight its physical branch but no magic', () => {
    const ids = classSkillIds('knight');
    expect(ids).toContain('strike');
    expect(ids).toContain('guard_break');
    expect(ids).toContain('cursed_riposte');
    expect(ids).toContain('executioner_oath');
    expect(ids.has('arcane_bolt')).toBe(false);
    expect(ids.has('firebolt')).toBe(false);
  });

  it('gives the archmage the arcane branch but not the physical line', () => {
    const ids = classSkillIds('archmage');
    expect(ids).toContain('arcane_bolt');
    expect(ids).toContain('void_lance');
    expect(ids).toContain('singularity');
    // strike é a básica universal, mas seus dependentes físicos não entram.
    expect(ids).toContain('strike');
    expect(ids.has('guard_break')).toBe(false);
    expect(ids.has('cursed_riposte')).toBe(false);
  });

  it('gives the necromancer frost and poison, not fire', () => {
    const ids = classSkillIds('necromancer');
    expect(ids).toContain('frost_shard');
    expect(ids).toContain('poison_mist');
    expect(ids).toContain('blizzard');
    expect(ids).toContain('last_goodbye');
    expect(ids.has('inferno')).toBe(false);
  });

  it('does not leak the universal basic into every branch', () => {
    // `strike` sozinho não deve puxar a linha física para um conjurador.
    const archmage = classSkillIds('archmage');
    expect(archmage.has('black_armor')).toBe(false);
  });

  it('gives the necromancer the shock and summon branches', () => {
    const ids = classSkillIds('necromancer');
    expect(ids).toContain('spark');
    expect(ids).toContain('chain_lightning');
    expect(ids).toContain('raise_dead');
    expect(ids).toContain('bone_legion');
  });

  it('keeps summons exclusive to the necromancer', () => {
    expect(classSkillIds('knight').has('raise_dead')).toBe(false);
    expect(classSkillIds('archmage').has('raise_dead')).toBe(false);
    expect(classSkillIds('paladin').has('raise_dead')).toBe(false);
  });
});

describe('Minion', () => {
  it('lives while it has HP and round-trips through save', () => {
    const minion = new Minion('Esqueleto', 'skelet', 24, 11);
    expect(minion.isAlive()).toBe(true);
    expect(minion.stats.attack).toBe(11);

    minion.stats.hp = 9;
    const restored = Minion.fromSave(minion.toSave());
    expect(restored.stats.hp).toBe(9);
    expect(restored.stats.maxHp).toBe(24);
    expect(restored.stats.attack).toBe(11);

    restored.stats.hp = 0;
    expect(restored.isAlive()).toBe(false);
  });
});
