import { ElementSystem } from '@/combat/ElementSystem';
import { Element, StatusEffectType } from '@/types';
import type { RNG } from '@/utils/RNG';
import type {
  ActiveStatusEffect,
  DamageResult,
  ElementName,
  Stats,
  StatusEffectTypeName,
} from '@/types';

interface DamageActor {
  stats: Stats;
  element?: ElementName;
  activeEffects?: ActiveStatusEffect[];
}

interface DamageSkill {
  power: number;
  element?: ElementName;
  penetration?: number;
  statusChance?: number;
  statusType?: StatusEffectTypeName;
  healPercent?: number;
}

const CRIT_MULT = 1.75;

export class DamageCalculator {
  static calculate(
    attacker: DamageActor | Stats,
    defender: DamageActor | Stats,
    skill: DamageSkill,
    rng?: RNG,
  ): DamageResult {
    const attackerStats = statsOf(attacker);
    const defenderStats = statsOf(defender);
    const atkElement = skill.element ?? elementOf(attacker);
    const defElement = elementOf(defender);

    // Ataques físicos escalam por atk/def; mágicos (qualquer outro elemento)
    // escalam por magic/resistance — assim a stat `magic` finalmente importa.
    const physical = atkElement === Element.Physical;
    const offense = physical ? attackOf(attackerStats) : magicOf(attackerStats);
    const defenseStat = physical ? defenseOf(defenderStats) : resistanceOf(defenderStats);

    const base = skill.power * offense;
    const elemMult = ElementSystem.getMultiplier(atkElement, defElement);
    const penetration = clamp01(skill.penetration ?? 0);
    const defReduced = defenseStat * (1 - penetration);
    let rawDamage = Math.max(1, base * elemMult - defReduced);

    if (hasEffect(attacker, StatusEffectType.Empowered)) rawDamage *= 1.3;
    if (hasEffect(defender, StatusEffectType.Burning) || hasEffect(defender, StatusEffectType.Burn)) {
      rawDamage *= 1.25;
    }
    if (hasEffect(defender, StatusEffectType.Shield)) rawDamage *= 0.5;

    const roll = rng ? rng.next() : Math.random();
    const isCrit = roll < critOf(attackerStats);
    const damage = Math.max(1, Math.round(rawDamage * (isCrit ? CRIT_MULT : 1)));
    const statusApplied = this.rollStatus(skill, rng);

    return {
      damage,
      isCrit,
      elementMultiplier: elemMult,
      ...(statusApplied ? { statusApplied } : {}),
      killingBlow: damage >= defenderStats.hp,
    };
  }

  static calculateHeal(caster: DamageActor | Stats, skill: DamageSkill): number {
    const healPercent = skill.healPercent ?? 0;
    return Math.max(0, Math.round(statsOf(caster).maxHp * healPercent));
  }

  static calculateExecuteBonus(target: DamageActor | Stats): number {
    const stats = statsOf(target);
    return stats.hp / Math.max(1, stats.maxHp) < 0.3 ? 2.0 : 1.0;
  }

  private static rollStatus(skill: DamageSkill, rng?: RNG): ActiveStatusEffect | undefined {
    if (!skill.statusType || !skill.statusChance || skill.statusChance <= 0) return undefined;
    const roll = rng ? rng.next() : Math.random();
    if (roll >= skill.statusChance) return undefined;
    return {
      type: skill.statusType,
      turnsRemaining: 3,
      power: Math.max(1, Math.round(skill.power * 0.25)),
    };
  }
}

function statsOf(actor: DamageActor | Stats): Stats {
  return 'stats' in actor ? actor.stats : actor;
}

function elementOf(actor: DamageActor | Stats): ElementName {
  return 'stats' in actor ? (actor.element ?? Element.Physical) : Element.Physical;
}

function attackOf(stats: Stats): number {
  return stats.atk ?? stats.attack ?? 1;
}

function defenseOf(stats: Stats): number {
  return stats.def ?? stats.defense ?? 0;
}

function magicOf(stats: Stats): number {
  return stats.magic ?? stats.atk ?? stats.attack ?? 1;
}

function resistanceOf(stats: Stats): number {
  return stats.resistance ?? stats.def ?? stats.defense ?? 0;
}

function critOf(stats: Stats): number {
  return stats.crit ?? 0;
}

function hasEffect(actor: DamageActor | Stats, type: StatusEffectTypeName): boolean {
  return 'stats' in actor ? (actor.activeEffects?.some((effect) => effect.type === type) ?? false) : false;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
