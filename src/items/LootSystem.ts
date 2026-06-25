import { ItemFactory } from '@/items/ItemFactory';
import type { Enemy } from '@/entities/Enemy';
import type { ItemDefinition, ItemInstance } from '@/types';
import type { RNG } from '@/utils/RNG';

import itemsData from '@/data/items.json';

const ITEMS = itemsData as ItemDefinition[];

/** Faixa de tier (1–3) apropriada para um andar. */
function bandForFloor(floor: number): number {
  if (floor <= 3) return 1;
  if (floor <= 6) return 2;
  return 3;
}

/** Equipamentos elegíveis para uma faixa (a faixa e a imediatamente abaixo). */
function equipmentForBand(band: number): ItemDefinition[] {
  return ITEMS.filter((item) => {
    if (item.kind !== 'weapon' && item.kind !== 'armor' && item.kind !== 'relic') return false;
    const tier = item.tier ?? 1;
    return tier <= band && tier >= band - 1;
  });
}

/** Poção (vida ou mana) do tier da faixa. */
function potionForBand(band: number, rng: RNG): string {
  const hp = band === 1 ? 'flask_red' : band === 2 ? 'flask_med_red' : 'flask_big_red';
  const mp = band === 1 ? 'flask_blue' : band === 2 ? 'flask_med_blue' : 'flask_big_blue';
  return rng.nextBool(0.5) ? hp : mp;
}

/**
 * Geração de espólios. Tudo derivado de um {@link RNG} (forkado da seed da run),
 * mantendo o loot reproduzível e escalando com a profundidade do calabouço.
 */
export class LootSystem {
  /**
   * Loot de um inimigo derrotado: cada id de `enemy.loot` (lista curada) é
   * rolado em instância (raridade/afixos escalam com o andar).
   */
  static rollEnemyLoot(enemy: Enemy, floor: number, rng: RNG): ItemInstance[] {
    return enemy.loot.map((id) => ItemFactory.roll(id, floor, rng));
  }

  /**
   * Loot de um baú: 1 equipamento (baús grandes 2–3, com bônus de raridade) da
   * faixa do andar + uma poção da faixa.
   */
  static rollChestLoot(floor: number, big: boolean, rng: RNG): ItemInstance[] {
    const band = bandForFloor(floor);
    const out: ItemInstance[] = [];

    const gearCount = big ? rng.nextInt(2, 3) : 1;
    const pool = equipmentForBand(band);
    for (let i = 0; i < gearCount && pool.length > 0; i++) {
      const def = rng.pick(pool);
      out.push(ItemFactory.roll(def.id, floor + (big ? 2 : 0), rng));
    }

    out.push(ItemFactory.basic(potionForBand(band, rng)));
    return out;
  }
}
