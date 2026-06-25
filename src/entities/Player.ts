import { Animator } from '@/entities/Animator';
import { Entity, normalizeStats, xpThreshold } from '@/entities/Entity';
import { Minion } from '@/entities/Minion';
import { clamp } from '@/utils/MathUtils';
import { EquipmentSlot } from '@/types';
import type {
  Affinities,
  ClassDefinition,
  ElementName,
  EquipmentSlotName,
  ItemDefinition,
  ItemInstance,
  SkillData,
  SkillDefinition,
  Stats,
  StatusEffectTypeName,
} from '@/types';

import classesData from '@/data/classes.json';
import skillsData from '@/data/skills.json';
import itemsData from '@/data/items.json';

const CLASSES = classesData as ClassDefinition[];
const SKILLS = skillsData as SkillDefinition[];
const ITEMS = itemsData as ItemDefinition[];

/** Resolve a definição de um item pelo id (catálogo estático). */
function itemDef(id: string): ItemDefinition | undefined {
  return ITEMS.find((item) => item.id === id);
}

/** Mapeia o tipo de item para o slot de equipamento, ou null se não equipável. */
function slotForKind(kind: ItemDefinition['kind']): EquipmentSlotName | null {
  if (kind === 'weapon') return EquipmentSlot.Weapon;
  if (kind === 'armor') return EquipmentSlot.Armor;
  if (kind === 'relic') return EquipmentSlot.Accessory;
  return null;
}

/**
 * Avatar do jogador. Carrega a classe pelo `classId`, controla progressao,
 * inventario, habilidades e animacoes principais.
 */
export class Player extends Entity {
  readonly classId: string;
  readonly classDefinition: ClassDefinition;
  affinities: Affinities = {};
  facingLeft = false;
  anim: 'idle' | 'run' = 'idle';

  unlockedSkills: string[];
  equippedSkills: string[];
  inventory: ItemInstance[] = [];
  /** Itens equipados por slot. Bônus somam aos stats efetivos. */
  equipment: Partial<Record<EquipmentSlotName, ItemInstance>> = {};
  /** Stats intrínsecos (classe + level-up + boosts permanentes), sem equipamento. */
  baseStats: Stats;
  /** Aliados invocados que persistem entre combates enquanto vivos. */
  minions: Minion[] = [];
  puzzlesSolved: string[] = [];
  totalPlaytime = 0;

  constructor(classId: string);
  constructor(x: number, y: number, definition: ClassDefinition);
  constructor(a: string | number, b?: number, c?: ClassDefinition) {
    const definition = typeof a === 'string' ? requireClass(a) : c;
    if (!definition) throw new Error('Classe de jogador nao encontrada.');

    const x = typeof a === 'number' ? a : 0;
    const y = typeof b === 'number' ? b : 0;
    super(x, y, '@', '#e8d8a0', true, definition.sprite);

    this.classId = definition.id;
    this.classDefinition = definition;
    this.baseStats = normalizeStats(definition.baseStats);
    this.stats = normalizeStats(definition.baseStats);
    this.recomputeStats();
    this.unlockedSkills = [...definition.startingSkills];
    this.equippedSkills = this.unlockedSkills.slice(0, 4);
    this.animator = this.buildAnimator();
    this.animator.play('idle', true);
  }

  override buildAnimator(): Animator {
    return new Animator()
      .add({ name: 'idle', frames: frames(4), frameTime: 160, loop: true })
      .add({ name: 'walk', frames: frames(4), frameTime: 90, loop: true })
      .add({ name: 'attack', frames: frames(4), frameTime: 80, loop: false })
      .add({ name: 'hurt', frames: [{ x: 0, y: 0 }], frameTime: 120, loop: false })
      .add({ name: 'death', frames: [{ x: 0, y: 0 }], frameTime: 240, loop: false });
  }

  override moveTo(x: number, y: number): void {
    super.moveTo(x, y);
    this.anim = 'run';
    this.animator.play('walk');
  }

  override update(dt: number): void {
    super.update(dt);
    if (this.animator.isDone() && this.isAlive()) {
      this.anim = 'idle';
      this.animator.play('idle');
    }
    this.totalPlaytime += dt;
  }

  override isAlive(): boolean {
    return this.stats.hp > 0;
  }

  gainXP(amount: number): boolean {
    this.baseStats.xp += Math.max(0, Math.round(amount));
    let leveled = false;

    while (this.baseStats.xp >= this.baseStats.xpToNext) {
      this.baseStats.xp -= this.baseStats.xpToNext;
      this.levelUp();
      leveled = true;
    }

    this.recomputeStats();
    return leveled;
  }

  /** Alias antigo mantido para chamadas existentes. */
  gainXp(amount: number): number {
    return this.gainXP(amount) ? 1 : 0;
  }

  levelUp(): void {
    this.baseStats.level++;
    if (
      this.classDefinition.hpPerLevel !== undefined ||
      this.classDefinition.manaPerLevel !== undefined ||
      this.classDefinition.atkPerLevel !== undefined ||
      this.classDefinition.defPerLevel !== undefined
    ) {
      this.applyStatDelta('maxHp', this.classDefinition.hpPerLevel ?? 0);
      this.applyStatDelta('maxMana', this.classDefinition.manaPerLevel ?? 0);
      this.applyStatDelta('atk', this.classDefinition.atkPerLevel ?? 0);
      this.applyStatDelta('def', this.classDefinition.defPerLevel ?? 0);
    } else {
      this.applyGrowth(this.classDefinition.growth);
    }
    this.baseStats = normalizeStats(this.baseStats);
    this.baseStats.xpToNext = xpThreshold(this.baseStats.level);
    this.recomputeStats();
    // Subir de nível enche os recursos.
    this.stats.hp = this.stats.maxHp;
    this.stats.mana = this.stats.maxMana;
    this.stats.mp = this.stats.maxMp;
  }

  applyGrowth(growth: Partial<Stats>): void {
    for (const key of Object.keys(growth) as (keyof Stats)[]) {
      const delta = growth[key];
      if (typeof delta !== 'number') continue;
      this.applyStatDelta(key, delta);
    }
    this.baseStats = normalizeStats(this.baseStats);
    this.recomputeStats();
  }

  getSkill(id: string): SkillData | null {
    const skill = SKILLS.find((s) => s.id === id);
    if (!skill) return null;
    const firstStatus = skill.applies?.[0];
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tier: skill.tier,
      treeId: skill.requires?.[0] ?? 'base',
      power: skill.power,
      element: skill.element as ElementName,
      manaCost: skill.mpCost,
      penetration: 0,
      statusChance: firstStatus ? 1 : 0,
      statusType: firstStatus?.id as StatusEffectTypeName | undefined,
      buffSelf: skill.support ? { hp: skill.power } : undefined,
      healPercent: skill.support ? skill.power / 100 : undefined,
      cooldown: 0,
      spriteFrame: `${skill.element}_skill`,
    };
  }

  heal(amount: number): number {
    const before = this.stats.hp;
    this.stats.hp = clamp(this.stats.hp + amount, 0, this.stats.maxHp);
    return this.stats.hp - before;
  }

  spendMp(amount: number): boolean {
    if (this.stats.mp < amount) return false;
    this.stats.mp -= amount;
    this.stats.mana = this.stats.mp;
    return true;
  }

  get xpToNext(): number {
    return this.stats.xpToNext;
  }

  hasItem(itemId: string): boolean {
    if (this.inventory.some((inst) => inst.defId === itemId)) return true;
    return Object.values(this.equipment).some((inst) => inst?.defId === itemId);
  }

  // --- Inventário e equipamento --------------------------------------------

  addItem(instance: ItemInstance): void {
    this.inventory.push(instance);
  }

  /** Remove e retorna a instância de id `uid` do inventário (ou undefined). */
  removeItem(uid: string): ItemInstance | undefined {
    const index = this.inventory.findIndex((inst) => inst.uid === uid);
    if (index < 0) return undefined;
    return this.inventory.splice(index, 1)[0];
  }

  /** Slot de equipamento de uma instância (ou null se não equipável). */
  slotOf(instance: ItemInstance): EquipmentSlotName | null {
    const def = itemDef(instance.defId);
    return def ? slotForKind(def.kind) : null;
  }

  /** Equipa a instância (deve estar no inventário). Devolve a anterior ao saco. */
  equip(instance: ItemInstance): boolean {
    const slot = this.slotOf(instance);
    if (!slot) return false;
    if (!this.removeItem(instance.uid)) return false;
    const previous = this.equipment[slot];
    this.equipment[slot] = instance;
    if (previous) this.inventory.push(previous);
    this.recomputeStats();
    return true;
  }

  /** Desequipa um slot, devolvendo o item ao inventário. */
  unequip(slot: EquipmentSlotName): boolean {
    const current = this.equipment[slot];
    if (!current) return false;
    delete this.equipment[slot];
    this.inventory.push(current);
    this.recomputeStats();
    return true;
  }

  /** Soma dos bônus (modifiers da def + afixos rolados) de todos os slots. */
  equipmentBonus(): Partial<Stats> {
    const total: Partial<Stats> = {};
    for (const inst of Object.values(this.equipment)) {
      if (!inst) continue;
      const def = itemDef(inst.defId);
      if (def?.modifiers) addCanonical(total, def.modifiers);
      addCanonical(total, inst.affixes);
    }
    return total;
  }

  /** Aplica um boost PERMANENTE (poção de elixir) aos stats intrínsecos. */
  boostBase(modifiers: Partial<Stats>): void {
    addCanonical(this.baseStats, modifiers);
    this.recomputeStats();
  }

  /** Recupera mana do pool atual, sem ultrapassar o máximo efetivo. */
  restoreMp(amount: number): number {
    const before = this.stats.mp;
    this.stats.mp = clamp(this.stats.mp + amount, 0, this.stats.maxMp);
    this.stats.mana = this.stats.mp;
    return this.stats.mp - before;
  }

  /**
   * Recalcula os stats EFETIVOS (`this.stats`) a partir de `baseStats` mais os
   * bônus de equipamento, preservando os pools atuais de HP/MP (clampados).
   */
  recomputeStats(): void {
    const b = this.baseStats;
    const bonus = this.equipmentBonus();
    const maxHp = b.maxHp + (bonus.maxHp ?? 0);
    const maxMp = b.maxMp + (bonus.maxMp ?? 0);
    const attack = b.attack + (bonus.attack ?? 0);
    const defense = b.defense + (bonus.defense ?? 0);
    const magic = b.magic + (bonus.magic ?? 0);
    const resistance = b.resistance + (bonus.resistance ?? 0);
    const speed = b.speed + (bonus.speed ?? 0);
    const crit = b.crit + (bonus.crit ?? 0);

    const hp = clamp(this.stats ? this.stats.hp : maxHp, 0, maxHp);
    const mp = clamp(this.stats ? this.stats.mp : maxMp, 0, maxMp);

    this.stats = {
      hp,
      maxHp,
      mana: mp,
      maxMana: maxMp,
      atk: attack,
      def: defense,
      spd: speed,
      crit,
      level: b.level,
      xp: b.xp,
      xpToNext: b.xpToNext,
      mp,
      maxMp,
      attack,
      defense,
      magic,
      resistance,
      speed,
    };
  }

  unlockSkill(skillId: string): void {
    if (!this.unlockedSkills.includes(skillId)) {
      this.unlockedSkills.push(skillId);
    }
    if (this.equippedSkills.length < 4 && !this.equippedSkills.includes(skillId)) {
      this.equippedSkills.push(skillId);
    }
  }

  isSkillEquipped(skillId: string): boolean {
    return this.equippedSkills.includes(skillId);
  }

  /**
   * Alterna o estado de equipada de uma skill desbloqueada nos 4 slots de
   * combate. Retorna o resultado para a UI dar o retorno adequado.
   */
  toggleSkill(skillId: string): 'equipped' | 'unequipped' | 'full' | 'locked' {
    if (!this.unlockedSkills.includes(skillId)) return 'locked';
    const index = this.equippedSkills.indexOf(skillId);
    if (index >= 0) {
      this.equippedSkills.splice(index, 1);
      return 'unequipped';
    }
    if (this.equippedSkills.length >= 4) return 'full';
    this.equippedSkills.push(skillId);
    return 'equipped';
  }

  private applyStatDelta(key: keyof Stats, delta: number): void {
    const base = this.baseStats;
    base[key] += delta;
    if (key === 'maxMp') base.maxMana += delta;
    if (key === 'mp') base.mana += delta;
    if (key === 'maxMana') base.maxMp += delta;
    if (key === 'mana') base.mp += delta;
    if (key === 'attack') base.atk += delta;
    if (key === 'atk') base.attack += delta;
    if (key === 'defense') base.def += delta;
    if (key === 'def') base.defense += delta;
    if (key === 'speed') base.spd += delta;
    if (key === 'spd') base.speed += delta;
  }
}

function requireClass(classId: string): ClassDefinition {
  const definition = CLASSES.find((klass) => klass.id === classId) ?? CLASSES[0];
  if (!definition) throw new Error('Nenhuma classe disponivel.');
  return definition;
}

/**
 * Soma os modificadores de `src` em `target` usando chaves canônicas, tratando
 * os aliases (atk/attack, def/defense, mp/mana, spd/speed) para que tanto os
 * acumuladores de bônus quanto `baseStats` fiquem internamente consistentes.
 */
function addCanonical(target: Partial<Stats>, src: Partial<Stats>): void {
  const dMaxHp = numeric(src.maxHp);
  const dMaxMp = numeric(src.maxMp ?? src.maxMana);
  const dAttack = numeric(src.attack ?? src.atk);
  const dDefense = numeric(src.defense ?? src.def);
  const dMagic = numeric(src.magic);
  const dResistance = numeric(src.resistance);
  const dSpeed = numeric(src.speed ?? src.spd);
  const dCrit = numeric(src.crit);

  bump(target, 'maxHp', dMaxHp);
  bump(target, 'maxMp', dMaxMp);
  bump(target, 'maxMana', dMaxMp);
  bump(target, 'attack', dAttack);
  bump(target, 'atk', dAttack);
  bump(target, 'defense', dDefense);
  bump(target, 'def', dDefense);
  bump(target, 'magic', dMagic);
  bump(target, 'resistance', dResistance);
  bump(target, 'speed', dSpeed);
  bump(target, 'spd', dSpeed);
  bump(target, 'crit', dCrit);
}

function bump(target: Partial<Stats>, key: keyof Stats, delta: number): void {
  if (delta) target[key] = (target[key] ?? 0) + delta;
}

function numeric(value: number | undefined): number {
  return typeof value === 'number' ? value : 0;
}

function frames(count: number) {
  return Array.from({ length: count }, (_, x) => ({ x, y: 0 }));
}
