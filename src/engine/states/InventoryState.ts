import { InventoryUI } from '@/ui/InventoryUI';
import { EquipmentSlot, GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { EquipmentSlotName, ItemInstance } from '@/types';

/** Ordem fixa dos slots na coluna de equipamento. */
const SLOTS: EquipmentSlotName[] = [EquipmentSlot.Weapon, EquipmentSlot.Armor, EquipmentSlot.Accessory];

/**
 * Tela de inventário (overlay): duas colunas — slots equipados e a mochila.
 * Setas navegam; ←/→ alternam a coluna; Enter equipa/usa ou desequipa.
 */
export class InventoryState implements GameState {
  readonly id = GameStateId.Inventory;
  readonly transparent = true;
  private readonly game: Game;
  private readonly ui: InventoryUI;
  private column: 'slots' | 'items' = 'items';
  private slotIndex = 0;
  private itemIndex = 0;

  constructor(game: Game) {
    this.game = game;
    this.ui = new InventoryUI(game.sprites);
  }

  enter(): void {
    this.column = this.game.player.inventory.length > 0 ? 'items' : 'slots';
    this.slotIndex = 0;
    this.itemIndex = 0;
  }

  exit(): void {
    /* nothing */
  }

  update(): void {
    /* static UI */
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.clampSelection();
    this.ui.render(
      ctx,
      {
        inventory: this.game.player.inventory,
        equipment: this.game.player.equipment,
        slots: SLOTS,
        column: this.column,
        slotIndex: this.slotIndex,
        itemIndex: this.itemIndex,
        stats: this.game.player.stats,
      },
      this.game.width,
      this.game.height,
    );
  }

  handleInput(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveUp:
        this.move(-1);
        break;
      case InputAction.MoveDown:
        this.move(1);
        break;
      case InputAction.MoveLeft:
        this.column = 'slots';
        this.game.audio.play('menu');
        break;
      case InputAction.MoveRight:
        this.column = 'items';
        this.game.audio.play('menu');
        break;
      case InputAction.Confirm:
        this.confirm();
        break;
      case InputAction.Inventory:
      case InputAction.Cancel:
        this.game.machine.pop();
        break;
      default:
        break;
    }
  }

  private move(delta: number): void {
    if (this.column === 'slots') {
      this.slotIndex = (this.slotIndex + delta + SLOTS.length) % SLOTS.length;
    } else {
      const len = this.game.player.inventory.length;
      if (len === 0) return;
      this.itemIndex = (this.itemIndex + delta + len) % len;
    }
    this.game.audio.play('menu');
  }

  private confirm(): void {
    const player = this.game.player;
    if (this.column === 'slots') {
      const slot = SLOTS[this.slotIndex];
      if (slot && player.unequip(slot)) this.game.audio.play('menu');
      else this.game.audio.play('error');
      return;
    }

    const instance = player.inventory[this.itemIndex];
    if (!instance) return;
    if (player.slotOf(instance)) {
      this.equip(instance);
    } else if (this.game.itemById(instance.defId)?.kind === 'consumable') {
      if (this.game.useConsumable(instance)) this.game.audio.play('success');
      else this.game.audio.play('error');
    } else {
      this.game.audio.play('error');
    }
  }

  private equip(instance: ItemInstance): void {
    if (this.game.player.equip(instance)) {
      this.game.audio.play('success');
      this.game.bus.emit('toast', { text: 'Equipado.' });
    } else {
      this.game.audio.play('error');
    }
  }

  /** Mantém os índices válidos após o inventário encolher (uso/equipar). */
  private clampSelection(): void {
    const len = this.game.player.inventory.length;
    if (this.itemIndex >= len) this.itemIndex = Math.max(0, len - 1);
  }
}
