import type { SkillDefinition, ElementName, StatusEffectTypeName, SummonSpec } from '@/types';

/**
 * A runtime wrapper around a {@link SkillDefinition}. Holds no per-cast state;
 * the {@link CombatSystem} reads its fields to resolve an action.
 */
export class Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly element: ElementName;
  readonly mpCost: number;
  readonly power: number;
  readonly penetration: number;
  readonly statusChance: number;
  readonly statusType?: StatusEffectTypeName;
  readonly healPercent: number;
  readonly range: number;
  readonly tier: number;
  readonly requires: string[];
  readonly support: boolean;
  readonly cooldown: number;
  readonly summon?: SummonSpec;

  constructor(def: SkillDefinition) {
    this.id = def.id;
    this.name = def.name;
    this.description = def.description;
    this.element = def.element;
    this.mpCost = def.mpCost;
    this.power = def.power;
    this.penetration = def.penetration ?? 0;
    this.statusChance = def.statusChance ?? 0;
    this.statusType = def.statusType;
    this.healPercent = def.healPercent ?? 0;
    this.range = def.range;
    this.tier = def.tier;
    this.requires = def.requires ? [...def.requires] : [];
    this.support = def.support ?? false;
    this.cooldown = def.cooldown ?? 0;
    this.summon = def.summon;
  }

  /** True if this skill heals/buffs rather than dealing damage. */
  get isSupport(): boolean {
    return this.support;
  }

  /** True if this skill summons an ally instead of acting on a target. */
  get isSummon(): boolean {
    return !!this.summon;
  }
}
