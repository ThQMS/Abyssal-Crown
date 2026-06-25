import { LootUI, type LootSummary } from '@/ui/LootUI';
import { nameOf } from '@/items/ItemText';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { ItemInstance } from '@/types';

/** Parâmetros de transição vindos do combate vencido ou de um baú aberto. */
export interface LootParams {
  /** Instâncias dropadas (com raridade/afixos já rolados). */
  items: ItemInstance[];
  xp: number;
  leveledUp: boolean;
  /** Título do painel; padrão "Vitória!". */
  title?: string;
}

/**
 * Tela dedicada de espólios após a vitória ou ao abrir um baú. Mostra XP, nível
 * e itens dropados (com raridade); ao confirmar, recolhe ao inventário.
 */
export class LootState implements GameState {
  readonly id = GameStateId.Loot;
  /** Renderiza sobre a exploração congelada ao fundo. */
  readonly transparent = true;
  private readonly game: Game;
  private readonly ui: LootUI;
  private summary: LootSummary = { items: [], xp: 0, leveledUp: false, title: 'Vitória!' };
  private items: ItemInstance[] = [];
  private timeMs = 0;
  private collected = false;

  constructor(game: Game) {
    this.game = game;
    this.ui = new LootUI(game.sprites);
  }

  enter(params?: unknown): void {
    const { items = [], xp = 0, leveledUp = false, title = 'Vitória!' } = (params as LootParams) ?? {};
    this.items = items;
    this.timeMs = 0;
    this.collected = false;
    this.summary = { items, xp, leveledUp, title };
  }

  exit(): void {
    /* nothing */
  }

  update(dtMs: number): void {
    this.timeMs += dtMs;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(ctx, this.summary, this.timeMs, this.game.width, this.game.height);
  }

  handleInput(action: InputActionName): void {
    if (action === InputAction.Confirm || action === InputAction.Cancel) {
      this.collect();
    }
  }

  /** Move os itens ao inventário e retorna à exploração. */
  private collect(): void {
    if (this.collected) return;
    this.collected = true;

    for (const instance of this.items) {
      this.game.player.addItem(instance);
    }

    // Volta à exploração ANTES dos toasts: só lá o HUD volta a escutar 'toast'.
    this.game.machine.pop();

    for (const instance of this.items) {
      this.game.bus.emit('ITEM_COLLECTED', { itemId: instance.defId });
      this.game.bus.emit('toast', { text: `Recolheu ${nameOf(instance)}.` });
    }
    if (this.items.length > 0) this.game.audio.play('pickup');
  }
}
