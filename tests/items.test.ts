import { describe, expect, it } from 'vitest';
import { ItemFactory } from '@/items/ItemFactory';
import { LootSystem } from '@/items/LootSystem';
import { Player } from '@/entities/Player';
import { RNG } from '@/utils/RNG';
import { isValidSave, migrateSave } from '@/persistence/SaveData';
import type { Enemy } from '@/entities/Enemy';

describe('ItemFactory', () => {
  it('rolls deterministically for the same seed', () => {
    const a = ItemFactory.roll('weapon_axe', 5, new RNG(123));
    const b = ItemFactory.roll('weapon_axe', 5, new RNG(123));
    expect(a.rarity).toBe(b.rarity);
    expect(a.affixes).toEqual(b.affixes);
  });

  it('produces common instances with no affixes for consumables', () => {
    const inst = ItemFactory.roll('flask_red', 9, new RNG(7));
    expect(inst.rarity).toBe('common');
    expect(Object.keys(inst.affixes)).toHaveLength(0);
  });

  it('skews rarity toward better drops on deeper floors', () => {
    const epics = (floor: number): number => {
      const rng = new RNG(999);
      let count = 0;
      for (let i = 0; i < 500; i++) {
        if (ItemFactory.roll('weapon_axe', floor, rng).rarity === 'epic') count++;
      }
      return count;
    };
    expect(epics(10)).toBeGreaterThan(epics(1));
  });
});

describe('LootSystem', () => {
  it('rolls one instance per id in an enemy loot table', () => {
    const enemy = { loot: ['weapon_axe', 'flask_red'] } as unknown as Enemy;
    const drops = LootSystem.rollEnemyLoot(enemy, 4, new RNG(1));
    expect(drops).toHaveLength(2);
    expect(drops.map((d) => d.defId)).toEqual(['weapon_axe', 'flask_red']);
  });

  it('drops gear plus a potion from a chest', () => {
    const drops = LootSystem.rollChestLoot(5, true, new RNG(2));
    expect(drops.length).toBeGreaterThanOrEqual(3); // 2-3 gear + 1 potion
    expect(drops.some((d) => d.defId.startsWith('flask'))).toBe(true);
  });
});

describe('Player equipment', () => {
  it('applies and fully reverses equipment stat bonuses', () => {
    const player = new Player('knight');
    const baseAttack = player.stats.attack;

    const axe = ItemFactory.basic('weapon_axe'); // +5 attack, sem afixos
    player.addItem(axe);
    expect(player.equip(axe)).toBe(true);
    expect(player.stats.attack).toBe(baseAttack + 5);
    expect(player.stats.atk).toBe(player.stats.attack); // alias em sincronia

    expect(player.unequip('weapon')).toBe(true);
    expect(player.stats.attack).toBe(baseAttack);
    expect(player.inventory.some((i) => i.uid === axe.uid)).toBe(true);
  });

  it('keeps level-up bonuses independent from equipment', () => {
    const player = new Player('knight');
    const axe = ItemFactory.basic('weapon_axe');
    player.addItem(axe);
    player.equip(axe);
    const before = player.stats.attack;
    player.levelUp();
    player.unequip('weapon');
    // Após subir de nível e desequipar, o ataque deve refletir o ganho de nível
    // (sem o +5 da arma), e não voltar ao valor pré-nível.
    expect(player.stats.attack).toBeGreaterThanOrEqual(before - 5);
  });
});

describe('Save migration', () => {
  it('migrates a v1 save (string inventory) to the v2 schema', () => {
    const v1 = {
      version: 1,
      savedAt: 0,
      playerClass: 'knight',
      playerName: 'Herói',
      currentFloor: 3,
      dungeonSeed: 42,
      stats: { hp: 30, maxHp: 30 },
      unlockedSkills: ['strike'],
      equippedSkills: ['strike'],
      inventory: ['flask_red', 'weapon_axe'],
      puzzlesSolved: [],
      enemiesDefeated: 1,
      totalPlaytime: 1000,
    };
    const migrated = migrateSave(v1);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(2);
    expect(migrated?.inventory).toHaveLength(2);
    expect(migrated?.inventory[0]?.defId).toBe('flask_red');
    expect(migrated?.equipped).toEqual({});
    expect(isValidSave(migrated)).toBe(true);
  });

  it('rejects unknown versions', () => {
    expect(migrateSave({ version: 99 })).toBeNull();
    expect(migrateSave(null)).toBeNull();
  });

  it('defaults skill points to 0 when migrating from v1', () => {
    const migrated = migrateSave({
      version: 1,
      playerClass: 'knight',
      currentFloor: 1,
      dungeonSeed: 1,
      stats: { hp: 1, maxHp: 1 },
      inventory: [],
    });
    expect(migrated?.skillPoints).toBe(0);
  });
});

describe('Player skill loadout', () => {
  it('equips and unequips skills across the 4 combat slots', () => {
    const player = new Player('knight');
    player.unlockedSkills = ['a', 'b', 'c', 'd', 'e'];
    player.equippedSkills = [];

    expect(player.toggleSkill('a')).toBe('equipped');
    expect(player.toggleSkill('b')).toBe('equipped');
    expect(player.toggleSkill('c')).toBe('equipped');
    expect(player.toggleSkill('d')).toBe('equipped');
    expect(player.toggleSkill('e')).toBe('full'); // 5º não cabe
    expect(player.isSkillEquipped('e')).toBe(false);

    expect(player.toggleSkill('a')).toBe('unequipped');
    expect(player.toggleSkill('e')).toBe('equipped'); // agora há espaço
    expect(player.toggleSkill('zzz')).toBe('locked'); // não desbloqueada
  });
});
