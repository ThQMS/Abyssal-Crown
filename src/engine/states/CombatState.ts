import { CombatSystem } from '@/combat/CombatSystem';
import { LootSystem } from '@/items/LootSystem';
import { CombatUI, type CombatMode } from '@/ui/CombatUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { Enemy } from '@/entities/Enemy';
import type { Skill } from '@/combat/Skill';

interface CombatParams {
  enemies: Enemy[];
}

const MENU = ['Atacar', 'Habilidade', 'Item', 'Defender'];
/** Pausa após a vitória para a animação de morte terminar antes do espólio. */
const VICTORY_DELAY_MS = 650;
/** Filtro de tinte de armadura por tier (bronze → prata → dourado). */
const TIER_TINT: Record<number, string> = {
  1: 'sepia(0.9) saturate(2) hue-rotate(-20deg) brightness(0.95)',
  2: 'grayscale(0.7) brightness(1.35) contrast(1.05)',
  3: 'sepia(1) saturate(3) hue-rotate(-8deg) brightness(1.15)',
};

/** Drives a single turn-based encounter and its menu-driven player input. */
export class CombatState implements GameState {
  readonly id = GameStateId.Combat;
  private readonly game: Game;
  private readonly ui: CombatUI;

  private system!: CombatSystem;
  private mode: CombatMode = 'menu';
  private menuIndex = 0;
  private skillIndex = 0;
  private targetIndex = 0;
  private skills: Skill[] = [];
  private pendingSkill?: Skill;
  private timeMs = 0;
  private resolving = false;
  private unsubHit?: () => void;
  /** Nível do jogador ao iniciar, para detectar level up na tela de espólios. */
  private startLevel = 1;
  /** Sequência de fim em curso (vitória): contagem regressiva da pausa. */
  private ending = false;
  private endDelayMs = 0;

  constructor(game: Game) {
    this.game = game;
    this.ui = new CombatUI(game.sprites);
  }

  enter(params?: unknown): void {
    const { enemies } = (params as CombatParams) ?? { enemies: [] };
    this.ui.reset();
    this.system = new CombatSystem({
      player: this.game.player,
      enemies,
      resolveSkill: this.game.resolveSkill,
      rng: this.game.rng,
      bus: this.game.bus,
    });
    // Números de dano flutuantes alimentados pelos acertos do combate.
    this.unsubHit = this.game.bus.on('combat:hit', ({ targetId, amount, element, crit, heal }) => {
      this.ui.pushDamage(targetId, amount, element, crit, heal);
    });
    // Combate usa as 4 skills EQUIPADAS (mesmas do HUD), não todas as desbloqueadas.
    this.skills = this.game.player.equippedSkills
      .map((id) => this.game.resolveSkill(id))
      .filter((s): s is Skill => !!s)
      .slice(0, 4);
    this.mode = 'menu';
    this.menuIndex = 0;
    this.skillIndex = 0;
    this.targetIndex = 0;
    this.pendingSkill = undefined;
    this.resolving = false;
    this.startLevel = this.game.player.stats.level;
    this.ending = false;
    this.endDelayMs = 0;
  }

  exit(): void {
    this.unsubHit?.();
    this.unsubHit = undefined;
  }

  update(dtMs: number): void {
    this.timeMs += dtMs;

    // O fim do combate é assíncrono (afterAction usa setTimeout). Detectamos
    // aqui para que a vitória sempre transicione, mesmo sem input do jogador.
    if (this.ending) {
      this.endDelayMs -= dtMs;
      if (this.endDelayMs <= 0) this.finishVictory();
      return;
    }
    if (this.system.isOver && this.system.victory) {
      this.ending = true;
      // Espera a animação de morte assentar antes de mostrar os espólios.
      this.endDelayMs = this.ui.hasDyingEnemies ? VICTORY_DELAY_MS : VICTORY_DELAY_MS / 2;
      this.game.audio.play('success');
    }
    // A derrota é tratada pelo evento player:died (Game → GameOver).
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(
      ctx,
      {
        system: this.system,
        mode: this.mode,
        menu: MENU,
        menuIndex: this.menuIndex,
        skills: this.skills,
        skillIndex: this.skillIndex,
        targetIndex: this.targetIndex,
        timeMs: this.timeMs,
        pendingSkill: this.pendingSkill,
        itemPreview: this.game.bestConsumable(),
        playerWeaponSprite: this.weaponSprite(),
        playerArmorTint: this.armorTint(),
        cooldownOf: (id: string) => this.system.getCooldown(id),
      },
      this.game.width,
      this.game.height,
    );
  }

  /** Sprite da arma equipada (para sobrepor ao herói no combate). */
  private weaponSprite(): string | undefined {
    const inst = this.game.player.equipment.weapon;
    return inst ? this.game.itemById(inst.defId)?.sprite : undefined;
  }

  /** Cor do tinte de armadura, conforme o tier do item equipado. */
  private armorTint(): string | undefined {
    const inst = this.game.player.equipment.armor;
    if (!inst) return undefined;
    const tier = this.game.itemById(inst.defId)?.tier ?? 1;
    return TIER_TINT[tier] ?? TIER_TINT[1];
  }

  handleInput(action: InputActionName): void {
    this.resolving = this.system.getPhase() === 'ANIMANDO' || this.system.getPhase() === 'TURNO_INIMIGO';
    if (this.resolving || !this.system.isPlayerTurn) return;
    switch (this.mode) {
      case 'menu':
        this.handleMenu(action);
        break;
      case 'skill':
        this.handleSkillSelect(action);
        break;
      case 'target':
        this.handleTargetSelect(action);
        break;
      default:
        break;
    }
  }

  private handleMenu(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveLeft:
        this.menuIndex = (this.menuIndex - 1 + MENU.length) % MENU.length;
        this.game.audio.play('menu');
        break;
      case InputAction.MoveRight:
        this.menuIndex = (this.menuIndex + 1) % MENU.length;
        this.game.audio.play('menu');
        break;
      case InputAction.Confirm:
        this.chooseMenu();
        break;
      default:
        break;
    }
  }

  private chooseMenu(): void {
    const choice = MENU[this.menuIndex];
    if (choice === 'Atacar') {
      this.pendingSkill = undefined;
      this.enterTargeting();
    } else if (choice === 'Habilidade') {
      if (this.skills.length === 0) {
        this.game.bus.emit('toast', { text: 'Nenhuma habilidade desbloqueada.' });
        return;
      }
      this.mode = 'skill';
    } else if (choice === 'Item') {
      if (this.game.useBestConsumable()) {
        this.system.playerUseItem();
        this.afterPlayerAction();
      }
    } else if (choice === 'Defender') {
      this.system.playerDefend();
      this.game.audio.play('menu');
      this.afterPlayerAction();
    }
  }

  private handleSkillSelect(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveLeft:
        this.skillIndex = (this.skillIndex - 1 + this.skills.length) % this.skills.length;
        break;
      case InputAction.MoveRight:
        this.skillIndex = (this.skillIndex + 1) % this.skills.length;
        break;
      case InputAction.Confirm:
        this.pendingSkill = this.skills[this.skillIndex];
        this.enterTargeting();
        break;
      case InputAction.Cancel:
        this.mode = 'menu';
        break;
      default:
        break;
    }
  }

  private handleTargetSelect(action: InputActionName): void {
    const targets = this.system.livingEnemies;
    if (targets.length === 0) {
      // Alvo morreu (ex.: dano por turno). Volta ao menu; update() encerra.
      this.mode = 'menu';
      return;
    }
    switch (action) {
      case InputAction.MoveUp:
        this.targetIndex = (this.targetIndex - 1 + targets.length) % targets.length;
        break;
      case InputAction.MoveDown:
        this.targetIndex = (this.targetIndex + 1) % targets.length;
        break;
      case InputAction.Confirm: {
        const target = targets[Math.min(this.targetIndex, targets.length - 1)];
        if (target) this.executeAction(target);
        break;
      }
      case InputAction.Cancel:
        this.mode = this.pendingSkill ? 'skill' : 'menu';
        break;
      default:
        break;
    }
  }

  private enterTargeting(): void {
    this.targetIndex = 0;
    this.mode = 'target';
  }

  private executeAction(target: Enemy): void {
    if (this.pendingSkill) {
      const ok = this.system.playerCast(this.pendingSkill, target);
      if (!ok) {
        // Recusada (recarga ou mana): volta ao menu sem gastar o turno.
        this.game.audio.play('error');
        this.pendingSkill = undefined;
        this.mode = 'menu';
        return;
      }
      this.game.audio.play('cast');
    } else {
      this.game.audio.play('hit');
      this.system.playerAttack(target);
    }
    this.pendingSkill = undefined;
    this.afterPlayerAction();
  }

  private afterPlayerAction(): void {
    // Se o combate já acabou, deixa o update() conduzir a saída (vitória) ou o
    // evento player:died (derrota); apenas evita reabrir o menu.
    if (this.system.isOver) return;
    this.mode = 'menu';
    this.menuIndex = 0;
  }

  /**
   * Vitória: coleta o loot dos inimigos derrotados, volta à exploração e abre a
   * tela dedicada de espólios. Chamado após a pausa da animação de morte.
   */
  private finishVictory(): void {
    const enemies = this.system.enemies;
    const rng = this.game.rng.fork();
    const items = enemies.flatMap((enemy) => LootSystem.rollEnemyLoot(enemy, this.game.depth, rng));
    const xp = enemies.reduce((sum, enemy) => sum + enemy.xpReward, 0);
    const leveledUp = this.game.player.stats.level > this.startLevel;

    this.game.level.removeDeadEnemies();
    if (items.length > 0) this.game.bus.emit('LOOT_DROPPED', { items: items.map((i) => i.defId) });

    // Fecha o combate (volta à exploração) e empilha a tela de espólios.
    this.game.machine.pop();
    this.game.machine.push(GameStateId.Loot, { items, xp, leveledUp });
  }
}
