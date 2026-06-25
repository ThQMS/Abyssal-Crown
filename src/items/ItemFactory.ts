import { Rarity } from '@/types';
import type { ItemDefinition, ItemInstance, RarityName, Stats } from '@/types';
import type { RNG } from '@/utils/RNG';

import itemsData from '@/data/items.json';

const ITEMS = itemsData as ItemDefinition[];

/** Metadados de exibição por raridade (cor + rótulo), usados pela UI. */
export const RARITY_META: Record<RarityName, { label: string; color: string }> = {
  [Rarity.Common]: { label: 'Comum', color: '#c8c4d8' },
  [Rarity.Rare]: { label: 'Raro', color: '#5aa0ff' },
  [Rarity.Epic]: { label: 'Épico', color: '#c06aff' },
};

/** Config por raridade: nº de afixos extras e multiplicador de magnitude. */
const RARITY_CONFIG: Record<RarityName, { extraAffixes: number; magnitudeMult: number }> = {
  [Rarity.Common]: { extraAffixes: 1, magnitudeMult: 1 },
  [Rarity.Rare]: { extraAffixes: 2, magnitudeMult: 1.25 },
  [Rarity.Epic]: { extraAffixes: 3, magnitudeMult: 1.6 },
};

/** Afixos sorteáveis. `roll` devolve a magnitude (positiva) escalada por andar. */
interface AffixSpec {
  key: keyof Stats;
  roll(floor: number, rng: RNG): number;
}

const AFFIX_POOL: AffixSpec[] = [
  { key: 'attack', roll: (f, r) => Math.max(1, Math.round((1 + f * 0.6) * r.float(0.6, 1.1))) },
  { key: 'defense', roll: (f, r) => Math.max(1, Math.round((1 + f * 0.5) * r.float(0.6, 1.1))) },
  { key: 'magic', roll: (f, r) => Math.max(1, Math.round((1 + f * 0.6) * r.float(0.6, 1.1))) },
  { key: 'resistance', roll: (f, r) => Math.max(1, Math.round((1 + f * 0.5) * r.float(0.6, 1.1))) },
  { key: 'maxHp', roll: (f, r) => Math.max(2, Math.round((4 + f * 1.6) * r.float(0.6, 1.1))) },
  { key: 'maxMp', roll: (f, r) => Math.max(2, Math.round((3 + f * 1.1) * r.float(0.6, 1.1))) },
  { key: 'speed', roll: (f, r) => Math.max(1, Math.round((1 + f * 0.3) * r.float(0.5, 1.0))) },
  { key: 'crit', roll: (f, r) => Math.round(r.float(0.02, 0.03 + f * 0.004) * 1000) / 1000 },
];

let uidCounter = 0;

export class ItemFactory {
  /** Resolve a definição de um item pelo id. */
  static def(id: string): ItemDefinition | undefined {
    return ITEMS.find((item) => item.id === id);
  }

  /** Cria uma instância "crua" (comum, sem afixos) — itens fixos/recompensas. */
  static basic(defId: string): ItemInstance {
    return { uid: makeUid(defId), defId, rarity: Rarity.Common, affixes: {} };
  }

  /**
   * Rola uma instância de `defId`: equipamentos ganham raridade (pesada para
   * melhor conforme o andar) e afixos aleatórios; consumíveis/chaves saem como
   * instância comum sem afixos.
   */
  static roll(defId: string, floor: number, rng: RNG): ItemInstance {
    const def = ItemFactory.def(defId);
    if (!def || !isEquipment(def)) return ItemFactory.basic(defId);

    const rarity = rollRarity(floor, rng);
    const affixes = rollAffixes(rarity, floor, rng);
    return { uid: makeUid(defId), defId, rarity, affixes };
  }
}

function isEquipment(def: ItemDefinition): boolean {
  return def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'relic';
}

/** Pesos de raridade deslocam-se para raro/épico conforme a profundidade. */
function rollRarity(floor: number, rng: RNG): RarityName {
  const t = Math.min(1, Math.max(0, floor / 10));
  const weights: [RarityName, number][] = [
    [Rarity.Common, 70 - 40 * t],
    [Rarity.Rare, 25 + 20 * t],
    [Rarity.Epic, 5 + 20 * t],
  ];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [name, w] of weights) {
    if (roll < w) return name;
    roll -= w;
  }
  return Rarity.Common;
}

function rollAffixes(rarity: RarityName, floor: number, rng: RNG): Partial<Stats> {
  const count = RARITY_CONFIG[rarity].extraAffixes;
  const mult = RARITY_CONFIG[rarity].magnitudeMult;
  const chosen = rng.shuffle(AFFIX_POOL).slice(0, count);
  const affixes: Partial<Stats> = {};
  for (const spec of chosen) {
    const value = spec.roll(floor, rng) * (spec.key === 'crit' ? 1 : mult);
    const rounded = spec.key === 'crit' ? Math.round(value * 1000) / 1000 : Math.round(value);
    affixes[spec.key] = (affixes[spec.key] ?? 0) + rounded;
  }
  return affixes;
}

function makeUid(defId: string): string {
  uidCounter += 1;
  return `${defId}#${uidCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
