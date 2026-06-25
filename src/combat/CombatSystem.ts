import { TurnQueue } from '@/combat/TurnQueue';
import { DamageCalculator } from '@/combat/DamageCalculator';
import { EnemyAI } from '@/combat/EnemyAI';
import { Skill } from '@/combat/Skill';
import { Enemy } from '@/entities/Enemy';
import { Minion } from '@/entities/Minion';
import { Element, StatusEffectType } from '@/types';
import type { Player } from '@/entities/Player';
import type { RNG } from '@/utils/RNG';
import type { EventBus } from '@/engine/EventBus';
import type { ActiveStatusEffect, DamageResult, SkillDefinition } from '@/types';

export type CombatPhase =
  | 'INICIANDO'
  | 'SELECIONANDO_ACAO'
  | 'ANIMANDO'
  | 'TURNO_INIMIGO'
  | 'ENCERRADO';

export type Combatant = Player | Enemy | Minion;
export type SkillResolver = (id: string) => Skill | undefined;

/** Máximo de aliados invocados ativos ao mesmo tempo. */
const MAX_ALLIES = 3;

export interface CombatConfig {
  player: Player;
  enemies: Enemy[];
  resolveSkill: SkillResolver;
  rng: RNG;
  bus?: EventBus;
}

const BASIC_ATTACK: SkillDefinition = {
  id: 'basic_attack',
  name: 'Ataque Básico',
  description: 'Um ataque simples.',
  element: Element.Physical,
  mpCost: 0,
  power: 1,
  penetration: 0,
  statusChance: 0,
  range: 1,
  tier: 1,
};

export class CombatSystem {
  player!: Player;
  enemies: Enemy[] = [];
  /** Aliados invocados (esqueletos do necromante, etc.). */
  allies: Minion[] = [];
  readonly log: string[] = [];

  private readonly queue = new TurnQueue<Combatant>();
  private readonly resolveSkill: SkillResolver;
  private readonly bus?: EventBus;
  private readonly rng: RNG;
  /** Recargas ativas do jogador, por id de skill (em turnos). */
  private readonly cooldowns = new Map<string, number>();
  private phase: CombatPhase = 'INICIANDO';
  private current: Combatant | null = null;
  private enemyPhaseThreeHealed = new Set<number>();
  private ended = false;

  constructor(config: CombatConfig) {
    this.resolveSkill = config.resolveSkill;
    this.bus = config.bus;
    // Fork isola a aleatoriedade do combate do fluxo de geração do calabouco,
    // mantendo tudo derivado da seed da run (sem Math.random global).
    this.rng = config.rng.fork();
    this.startCombat(config.player, config.enemies);
  }

  /** Turnos de recarga restantes de uma skill (0 = pronta). */
  getCooldown(skillId: string): number {
    return this.cooldowns.get(skillId) ?? 0;
  }

  startCombat(player: Player, enemies: Enemy[]): void {
    this.player = player;
    this.enemies = enemies;
    // Aliados persistem no jogador entre combates: descarta os mortos e reusa os
    // sobreviventes (mesma referência, para que mudanças reflitam na run).
    player.minions = player.minions.filter((minion) => minion.isAlive());
    this.allies = player.minions;
    this.log.length = 0;
    this.cooldowns.clear();
    this.ended = false;
    this.phase = 'INICIANDO';
    this.queue.build([player, ...this.allies, ...enemies], this.rng);
    this.addLog('O combate começou.');
    this.bus?.emit('COMBAT_START', { enemyIds: enemies.map((enemy) => enemy.defId) });
    this.bus?.emit('combat:start', { enemyIds: enemies.map((enemy) => enemy.defId) });
    this.nextTurn();
  }

  playerAction(skillId: string, targetId: number): boolean {
    if (this.phase !== 'SELECIONANDO_ACAO' || this.current !== this.player) return false;

    const skill = this.resolveSkill(skillId) ?? new Skill(BASIC_ATTACK);
    const target = this.enemies.find((enemy) => enemy.id === targetId && enemy.isAlive());
    if (!target && !skill.isSupport) return false;

    if (this.getCooldown(skill.id) > 0) {
      this.addLog(`${skill.name} ainda está em recarga (${this.getCooldown(skill.id)}).`);
      return false;
    }

    if (!this.player.spendMp(skill.mpCost)) {
      this.addLog(`Mana insuficiente para usar ${skill.name}.`);
      return false;
    }

    if (skill.cooldown > 0) this.cooldowns.set(skill.id, skill.cooldown);

    this.phase = 'ANIMANDO';
    if (skill.isSummon) {
      this.castSummon(this.player, skill);
    } else if (skill.isSupport) {
      this.resolveSupport(this.player, skill);
    } else if (target) {
      this.resolveDamage(this.player, target, skill);
    }

    window.setTimeout(() => this.afterAction(), 800);
    return true;
  }

  /** Invoca os aliados descritos por `skill.summon`, respeitando o limite. */
  private castSummon(caster: Combatant, skill: Skill): void {
    const spec = skill.summon;
    if (!spec) return;
    const count = spec.count ?? 1;
    let summoned = 0;
    for (let i = 0; i < count; i++) {
      if (this.allies.length >= MAX_ALLIES) break;
      const minion = new Minion(spec.name, spec.sprite, spec.hp, spec.attack);
      this.allies.push(minion);
      this.queue.add(minion);
      summoned++;
    }
    if (summoned > 0) {
      this.addLog(`${this.nameOf(caster)} ergueu ${summoned > 1 ? `${summoned} ${spec.name}s` : spec.name}.`);
    } else {
      this.addLog('Não há espaço para mais invocações.');
    }
  }

  get livingAllies(): Minion[] {
    return this.allies.filter((ally) => ally.isAlive());
  }

  nextTurn(): void {
    if (this.checkVictory() || this.checkDefeat()) return;

    const next = this.queue.next();
    if (!next) {
      this.phase = 'ENCERRADO';
      return;
    }

    this.current = next;
    this.processStartOfTurn(next);
    if (this.checkVictory() || this.checkDefeat()) return;

    if (this.consumeControlEffect(next)) {
      window.setTimeout(() => this.afterAction(), 800);
      return;
    }

    if (next === this.player) {
      this.tickCooldowns();
      this.phase = 'SELECIONANDO_ACAO';
    } else if (next instanceof Minion) {
      this.phase = 'TURNO_INIMIGO';
      this.takeMinionTurn(next);
    } else {
      this.phase = 'TURNO_INIMIGO';
      this.executeEnemyTurn(next as Enemy);
    }
  }

  /** Turno de um aliado invocado: ataca um inimigo aleatório. */
  takeMinionTurn(minion: Minion): void {
    if (this.phase !== 'TURNO_INIMIGO' || !minion.isAlive()) return;
    const targets = this.livingEnemies;
    if (targets.length > 0) {
      const target = this.rng.pick(targets);
      this.resolveDamage(minion, target, new Skill(BASIC_ATTACK));
    }
    window.setTimeout(() => this.afterAction(), 800);
  }

  executeEnemyTurn(enemy: Enemy): void {
    if (this.phase !== 'TURNO_INIMIGO' || !enemy.isAlive()) return;
    EnemyAI.takeTurn(enemy, this.player, this);
    window.setTimeout(() => this.afterAction(), 800);
  }

  checkVictory(): boolean {
    if (this.ended) return true;
    if (this.enemies.some((enemy) => enemy.isAlive())) return false;

    const xpGained = this.enemies.reduce((sum, enemy) => sum + enemy.xpReward, 0);
    this.phase = 'ENCERRADO';
    this.ended = true;
    this.addLog(`Vitória! Você recebeu ${xpGained} XP.`);
    this.bus?.emit('COMBAT_END', { victory: true, xpGained });
    this.bus?.emit('combat:end', { victory: true });
    return true;
  }

  checkDefeat(): boolean {
    if (this.ended) return true;
    if (this.player.isAlive()) return false;

    this.phase = 'ENCERRADO';
    this.ended = true;
    this.addLog('Você caiu nas profundezas.');
    this.bus?.emit('PLAYER_DIED', undefined);
    this.bus?.emit('player:died', undefined);
    return true;
  }

  addLog(msg: string): void {
    this.log.push(msg);
    while (this.log.length > 10) this.log.shift();
  }

  getLog(): string[] {
    return [...this.log];
  }

  getPhase(): CombatPhase {
    return this.phase;
  }

  getEnemies(): Enemy[] {
    return this.enemies;
  }

  getCurrentTurn(): Combatant | null {
    return this.current;
  }

  get isOver(): boolean {
    return this.phase === 'ENCERRADO';
  }

  get victory(): boolean {
    return this.phase === 'ENCERRADO' && this.player.isAlive() && this.enemies.every((enemy) => !enemy.isAlive());
  }

  get livingEnemies(): Enemy[] {
    return this.enemies.filter((enemy) => enemy.isAlive());
  }

  get currentActor(): Combatant | undefined {
    return this.current ?? undefined;
  }

  get isPlayerTurn(): boolean {
    return this.phase === 'SELECIONANDO_ACAO' && this.current === this.player;
  }

  upcoming(count = 6): Combatant[] {
    const order = this.queue.getOrder();
    return (this.current ? [this.current, ...order] : order).slice(0, count);
  }

  playerAttack(target: Enemy): void {
    this.playerAction('basic_attack', target.id);
  }

  playerCast(skill: Skill, target: Enemy): boolean {
    return this.playerAction(skill.id, target.id);
  }

  playerDefend(): void {
    if (this.phase !== 'SELECIONANDO_ACAO' || this.current !== this.player) return;
    this.phase = 'ANIMANDO';
    this.player.applyStatus({ type: StatusEffectType.Shield, turnsRemaining: 2, power: 0 });
    this.addLog(`${this.playerName()} assumiu postura defensiva.`);
    window.setTimeout(() => this.afterAction(), 800);
  }

  playerUseItem(): void {
    if (this.phase !== 'SELECIONANDO_ACAO' || this.current !== this.player) return;
    this.phase = 'ANIMANDO';
    this.addLog(`${this.playerName()} usou um consumível.`);
    window.setTimeout(() => this.afterAction(), 800);
  }

  runEnemyTurns(): void {
    if (this.phase === 'TURNO_INIMIGO' && this.current && this.current !== this.player) {
      this.executeEnemyTurn(this.current as Enemy);
    }
  }

  enemyBasicAttack(enemy: Enemy): void {
    this.resolveDamage(enemy, this.pickEnemyTarget(), new Skill(BASIC_ATTACK));
  }

  enemyUseSkill(enemy: Enemy, skill: Skill): boolean {
    if (enemy.stats.mp < skill.mpCost) return false;
    enemy.stats.mp -= skill.mpCost;
    if (skill.isSupport) {
      this.resolveSupport(enemy, skill);
    } else {
      this.resolveDamage(enemy, this.pickEnemyTarget(), skill);
    }
    return true;
  }

  /**
   * Escolhe o alvo de um inimigo: os esqueletos aliados "puxam aggro" (50% de
   * chance de o golpe ir num aliado quando há algum), o resto vai no herói.
   */
  private pickEnemyTarget(): Player | Minion {
    const allies = this.livingAllies;
    if (allies.length > 0 && this.rng.next() < 0.5) return this.rng.pick(allies);
    return this.player;
  }

  resolveEnemySkill(_enemy: Enemy, skillId: string): Skill | undefined {
    return this.resolveSkill(skillId);
  }

  bossPhaseThreeWasHealed(enemy: Enemy): boolean {
    return this.enemyPhaseThreeHealed.has(enemy.id);
  }

  markBossPhaseThreeHealed(enemy: Enemy): void {
    this.enemyPhaseThreeHealed.add(enemy.id);
  }

  private afterAction(): void {
    if (this.checkVictory() || this.checkDefeat()) return;
    this.nextTurn();
  }

  private processStartOfTurn(entity: Combatant): void {
    if (entity.activeEffects.length === 0) return;

    for (const effect of [...entity.activeEffects]) {
      switch (effect.type) {
        case StatusEffectType.Freeze:
        case StatusEffectType.Stun:
          continue;
        case StatusEffectType.Burning:
        case StatusEffectType.Burn:
        case StatusEffectType.Poison: {
          const dealt = entity.takeDamage(effect.power);
          const element = effect.type === StatusEffectType.Poison ? Element.Poison : Element.Fire;
          this.bus?.emit('combat:hit', { targetId: entity.id, amount: dealt, element, crit: false });
          this.addLog(`${this.statusLabel(effect.type)} causou ${dealt} de dano em ${this.nameOf(entity)}.`);
          break;
        }
        case StatusEffectType.Regen: {
          const before = entity.stats.hp;
          entity.stats.hp = Math.min(entity.stats.maxHp, entity.stats.hp + effect.power);
          const healed = entity.stats.hp - before;
          this.bus?.emit('combat:hit', { targetId: entity.id, amount: healed, element: Element.Arcane, crit: false, heal: true });
          this.addLog(`${this.nameOf(entity)} recuperou ${healed} de vida.`);
          break;
        }
        default:
          break;
      }

      effect.turnsRemaining--;
    }

    entity.activeEffects = entity.activeEffects.filter((effect) => effect.turnsRemaining > 0);
  }

  private tickCooldowns(): void {
    for (const [id, turns] of this.cooldowns) {
      if (turns <= 1) this.cooldowns.delete(id);
      else this.cooldowns.set(id, turns - 1);
    }
  }

  private resolveDamage(attacker: Combatant, defender: Combatant, skill: Skill): DamageResult {
    const result = DamageCalculator.calculate(attacker, defender, skill, this.rng);
    const dealt = defender.takeDamage(result);
    if (!defender.isAlive() && defender !== this.player) this.queue.remove(defender);

    const crit = result.isCrit ? ' CRÍTICO!' : '';
    const status = result.statusApplied ? ` ${this.statusLabel(result.statusApplied.type)} aplicado.` : '';
    const label = this.effectivenessLabel(result.elementMultiplier);
    this.addLog(`${this.nameOf(attacker)} usou ${skill.name}! ${dealt} de dano.${crit}${label}${status}`);

    // Notifica a UI para os números de dano flutuantes (cor por elemento/crítico).
    this.bus?.emit('combat:hit', {
      targetId: defender.id,
      amount: dealt,
      element: skill.element,
      crit: result.isCrit,
    });

    if (defender === this.player) {
      this.bus?.emit('PLAYER_HURT', { amount: dealt, element: skill.element });
      this.bus?.emit('player:damaged', { amount: dealt, element: skill.element });
    } else if (!defender.isAlive() && defender instanceof Enemy) {
      const enemy = defender;
      this.addLog(`${enemy.name} foi derrotado.`);
      this.bus?.emit('ENEMY_DIED', { enemyId: enemy.defId, xp: enemy.xpReward });
      this.bus?.emit('enemy:defeated', { enemyId: enemy.defId, xp: enemy.xpReward });
    } else if (!defender.isAlive() && defender instanceof Minion) {
      this.addLog(`${defender.name} foi destruído.`);
      const index = this.allies.indexOf(defender);
      if (index >= 0) this.allies.splice(index, 1);
    }

    return result;
  }

  private resolveSupport(caster: Combatant, skill: Skill): void {
    const healed = DamageCalculator.calculateHeal(caster, skill);
    caster.stats.hp = Math.min(caster.stats.maxHp, caster.stats.hp + healed);
    if (skill.statusType) {
      caster.applyStatus({ type: skill.statusType, turnsRemaining: 2, power: Math.max(1, Math.round(skill.power)) });
    }
    if (healed > 0) {
      this.bus?.emit('combat:hit', { targetId: caster.id, amount: healed, element: skill.element, crit: false, heal: true });
    }
    this.addLog(`${this.nameOf(caster)} usou ${skill.name}! Recuperou ${healed} de vida.`);
  }

  private consumeControlEffect(entity: Combatant): boolean {
    const control = entity.activeEffects.find(
      (effect) =>
        (effect.type === StatusEffectType.Stun || effect.type === StatusEffectType.Freeze) &&
        effect.turnsRemaining > 0,
    );
    if (!control) return false;

    control.turnsRemaining = 0;
    entity.activeEffects = entity.activeEffects.filter((effect) => effect.turnsRemaining > 0);
    this.addLog(`${this.nameOf(entity)} perdeu o turno por ${this.statusLabel(control.type).toLowerCase()}.`);
    this.phase = 'ANIMANDO';
    return true;
  }

  private nameOf(entity: Combatant): string {
    return entity === this.player ? this.playerName() : (entity as Enemy).name;
  }

  private playerName(): string {
    return this.player.classDefinition?.name ?? 'Jogador';
  }

  private statusLabel(type: ActiveStatusEffect['type']): string {
    switch (type) {
      case StatusEffectType.Burning:
      case StatusEffectType.Burn:
        return 'Queimadura';
      case StatusEffectType.Poison:
        return 'Veneno';
      case StatusEffectType.Freeze:
        return 'Congelamento';
      case StatusEffectType.Stun:
        return 'Atordoamento';
      case StatusEffectType.Weaken:
        return 'Fraqueza';
      case StatusEffectType.Empowered:
        return 'Poder';
      case StatusEffectType.Shield:
        return 'Escudo';
      case StatusEffectType.Regen:
        return 'Regeneração';
      default:
        return 'Status';
    }
  }

  private effectivenessLabel(multiplier: number): string {
    if (multiplier >= 1.5) return ' SUPER EFETIVO!';
    if (multiplier <= 0.67) return ' Pouco efetivo...';
    return '';
  }
}
