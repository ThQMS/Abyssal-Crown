import { Skill } from '@/combat/Skill';
import type { SkillDefinition } from '@/types';

/** Habilidade básica que toda classe começa — não "abre" ramos de outras classes. */
const UNIVERSAL_SKILL = 'strike';

/**
 * Subconjunto de skills que uma classe pode aprender: o fecho para a frente a
 * partir das suas `startingSkills` (exceto a básica universal), mais as próprias
 * iniciais. Assim cada classe vê só o(s) seu(s) ramo(s) na árvore, derivado dos
 * dados existentes — sem precisar marcar classe em cada skill.
 */
export function skillsForClass(allDefs: SkillDefinition[], startingSkills: string[]): SkillDefinition[] {
  const byId = new Map(allDefs.map((def) => [def.id, def]));
  const reachable = new Set<string>();

  // Sementes: as iniciais, menos a básica universal (que é compartilhada).
  for (const id of startingSkills) {
    if (id !== UNIVERSAL_SKILL && byId.has(id)) reachable.add(id);
  }

  // Fecho: adiciona uma skill quando TODOS os seus pré-requisitos já entraram.
  let changed = true;
  while (changed) {
    changed = false;
    for (const def of allDefs) {
      if (reachable.has(def.id)) continue;
      const requires = def.requires ?? [];
      if (requires.length === 0) continue; // raízes só entram como semente
      if (requires.every((req) => reachable.has(req))) {
        reachable.add(def.id);
        changed = true;
      }
    }
  }

  // Inclui as iniciais (inclusive a básica) para a árvore ficar consistente.
  for (const id of startingSkills) {
    if (byId.has(id)) reachable.add(id);
  }

  return allDefs.filter((def) => reachable.has(def.id));
}

export interface SkillNode {
  skill: Skill;
  unlocked: boolean;
  /** True when every prerequisite is unlocked and a point is available. */
  available: boolean;
}

/**
 * A prerequisite-gated tree of {@link Skill}s. Tracks which skills are unlocked
 * and how many skill points the player may spend.
 */
export class SkillTree {
  private readonly skills = new Map<string, Skill>();
  private readonly unlocked = new Set<string>();
  points = 0;

  constructor(definitions: SkillDefinition[], unlocked: string[] = []) {
    for (const def of definitions) {
      this.skills.set(def.id, new Skill(def));
    }
    for (const id of unlocked) {
      if (this.skills.has(id)) this.unlocked.add(id);
    }
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** All skills the player has unlocked, as runtime objects. */
  get unlockedSkills(): Skill[] {
    return [...this.unlocked].map((id) => this.skills.get(id)).filter((s): s is Skill => !!s);
  }

  /** Prerequisites of `id` are all satisfied. */
  canUnlock(id: string): boolean {
    const skill = this.skills.get(id);
    if (!skill || this.unlocked.has(id)) return false;
    return skill.requires.every((req) => this.unlocked.has(req));
  }

  /** Spends one point to unlock `id`. Returns success. */
  unlock(id: string): boolean {
    if (this.points <= 0 || !this.canUnlock(id)) return false;
    this.unlocked.add(id);
    this.points--;
    return true;
  }

  /** Snapshot of the full tree for the {@link SkillTreeUI}. */
  nodes(): SkillNode[] {
    return [...this.skills.values()]
      .sort((a, b) => a.tier - b.tier)
      .map((skill) => ({
        skill,
        unlocked: this.unlocked.has(skill.id),
        available: this.points > 0 && this.canUnlock(skill.id),
      }));
  }

  /** Persists the unlocked id list. */
  serialize(): string[] {
    return [...this.unlocked];
  }
}
