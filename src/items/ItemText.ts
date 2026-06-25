import { ItemFactory, RARITY_META } from '@/items/ItemFactory';
import type { ItemDefinition, ItemInstance, Stats } from '@/types';

/** Rótulos curtos por stat canônico, para resumos de bônus. */
const STAT_LABELS: { keys: (keyof Stats)[]; label: string; percent?: boolean }[] = [
  { keys: ['attack', 'atk'], label: 'ATQ' },
  { keys: ['defense', 'def'], label: 'DEF' },
  { keys: ['magic'], label: 'MAG' },
  { keys: ['resistance'], label: 'RES' },
  { keys: ['maxHp'], label: 'HP máx' },
  { keys: ['maxMp', 'maxMana'], label: 'Mana máx' },
  { keys: ['speed', 'spd'], label: 'VEL' },
  { keys: ['crit'], label: 'Crít', percent: true },
];

export interface StatLine {
  label: string;
  value: number;
  percent?: boolean;
}

/** Definição de um item de uma instância. */
export function defOf(instance: ItemInstance): ItemDefinition | undefined {
  return ItemFactory.def(instance.defId);
}

export function nameOf(instance: ItemInstance): string {
  return defOf(instance)?.name ?? instance.defId;
}

export function rarityLabel(instance: ItemInstance): string {
  return RARITY_META[instance.rarity].label;
}

export function rarityColor(instance: ItemInstance): string {
  return RARITY_META[instance.rarity].color;
}

export function spriteOf(instance: ItemInstance): string {
  return defOf(instance)?.sprite ?? '';
}

export function isEquipment(instance: ItemInstance): boolean {
  const kind = defOf(instance)?.kind;
  return kind === 'weapon' || kind === 'armor' || kind === 'relic';
}

/**
 * Bônus efetivos de um equipamento (modifiers da def + afixos rolados), já
 * canonizados e agregados por stat para exibição/comparação.
 */
export function equipmentStats(instance: ItemInstance): StatLine[] {
  const def = defOf(instance);
  const sources: Partial<Stats>[] = [def?.modifiers ?? {}, instance.affixes];
  const out: StatLine[] = [];
  for (const { keys, label, percent } of STAT_LABELS) {
    // Soma cada fonte usando só a primeira chave-alias presente (evita dobrar).
    let value = 0;
    for (const src of sources) {
      for (const key of keys) {
        if (typeof src[key] === 'number') {
          value += src[key] as number;
          break;
        }
      }
    }
    if (value !== 0) out.push({ label, value, percent });
  }
  return out;
}

/** Resumo em uma linha dos bônus de um equipamento (ex.: "+5 ATQ • +3% Crít"). */
export function affixSummary(instance: ItemInstance): string {
  return equipmentStats(instance)
    .map((s) => formatStat(s))
    .join(' • ');
}

export function formatStat(stat: StatLine): string {
  if (stat.percent) return `+${Math.round(stat.value * 100)}% ${stat.label}`;
  return `+${stat.value} ${stat.label}`;
}

/** Efeito de um consumível (cura/mana/elixir), a partir dos modifiers. */
export function consumableEffect(def: ItemDefinition): string {
  const mods = def.modifiers ?? {};
  const out: string[] = [];
  if ((mods.hp ?? 0) > 0) out.push(`+${mods.hp} HP`);
  if ((mods.mp ?? mods.mana ?? 0) > 0) out.push(`+${mods.mp ?? mods.mana} Mana`);
  if ((mods.maxHp ?? 0) > 0) out.push(`+${mods.maxHp} HP máx`);
  if ((mods.magic ?? 0) > 0) out.push(`+${mods.magic} MAG`);
  if ((mods.attack ?? mods.atk ?? 0) > 0) out.push(`+${mods.attack ?? mods.atk} ATQ`);
  return out.join(' • ');
}
