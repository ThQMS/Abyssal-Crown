import type { CombatSystem } from '@/combat/CombatSystem';
import type { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import type { Skill } from '@/combat/Skill';

/** IA de combate em PT-BR: normal, elite e boss por fases de vida. */
export class EnemyAI {
  static takeTurn(enemy: Enemy, player: Player, combat: CombatSystem): void {
    if (EnemyAI.isBoss(enemy)) {
      EnemyAI.takeBossTurn(enemy, player, combat);
      return;
    }

    if (EnemyAI.isElite(enemy) && enemy.stats.hp / enemy.stats.maxHp < 0.5) {
      const special = EnemyAI.firstAvailableSpecial(enemy, combat);
      if (special && combat.enemyUseSkill(enemy, special)) return;
    }

    combat.enemyBasicAttack(enemy);
  }

  private static takeBossTurn(enemy: Enemy, _player: Player, combat: CombatSystem): void {
    const hpRatio = enemy.stats.hp / enemy.stats.maxHp;

    if (hpRatio > 0.66) {
      const heavy = combat.resolveEnemySkill(enemy, 'guard_break');
      if (heavy && combat.enemyUseSkill(enemy, heavy)) return;
      combat.enemyBasicAttack(enemy);
      return;
    }

    if (hpRatio > 0.33) {
      const poison = combat.resolveEnemySkill(enemy, 'poison_mist');
      const frost = combat.resolveEnemySkill(enemy, 'frost_shard');
      const chosen = poison && enemy.stats.mp >= poison.mpCost ? poison : frost;
      if (chosen && combat.enemyUseSkill(enemy, chosen)) return;
      combat.enemyBasicAttack(enemy);
      return;
    }

    if (!combat.bossPhaseThreeWasHealed(enemy)) {
      const heal = Math.round(enemy.stats.maxHp * 0.25);
      enemy.stats.hp = Math.min(enemy.stats.maxHp, enemy.stats.hp + heal);
      combat.markBossPhaseThreeHealed(enemy);
      combat.addLog(`${enemy.name} devorou a escuridão e recuperou ${heal} de vida.`);
      return;
    }

    const area = combat.resolveEnemySkill(enemy, 'inferno') ?? combat.resolveEnemySkill(enemy, 'blizzard');
    if (area && combat.enemyUseSkill(enemy, area)) return;
    combat.enemyBasicAttack(enemy);
  }

  private static firstAvailableSpecial(enemy: Enemy, combat: CombatSystem): Skill | undefined {
    for (const skillId of enemy.skills) {
      const skill = combat.resolveEnemySkill(enemy, skillId);
      if (skill && enemy.stats.mp >= skill.mpCost && !skill.isSupport) return skill;
    }
    return undefined;
  }

  private static isBoss(enemy: Enemy): boolean {
    return enemy.defId === 'big_demon' || enemy.behavior === 'boss';
  }

  private static isElite(enemy: Enemy): boolean {
    return enemy.behavior === 'elite' || enemy.defId.includes('orc') || enemy.defId.includes('necromancer');
  }
}
