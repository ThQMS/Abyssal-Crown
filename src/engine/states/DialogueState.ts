import { DialogueUI } from '@/ui/DialogueUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { LoreEntry } from '@/types';

interface DialogueParams {
  lore: LoreEntry;
}

const CHARS_PER_SECOND = 48;

/** Overlay that reveals a lore entry with a typewriter effect. */
export class DialogueState implements GameState {
  readonly id = GameStateId.Dialogue;
  readonly transparent = true;
  private readonly game: Game;
  private readonly ui = new DialogueUI();
  private lore?: LoreEntry;
  private revealed = 0;

  constructor(game: Game) {
    this.game = game;
  }

  enter(params?: unknown): void {
    this.lore = (params as DialogueParams)?.lore;
    this.revealed = 0;
  }

  exit(): void {
    this.lore = undefined;
  }

  update(dtMs: number): void {
    if (!this.lore) return;
    if (this.revealed < this.lore.body.length) {
      this.revealed = Math.min(this.lore.body.length, this.revealed + (CHARS_PER_SECOND * dtMs) / 1000);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.lore) return;
    this.ui.render(ctx, this.lore, this.revealed, this.game.width, this.game.height);
  }

  handleInput(action: InputActionName): void {
    if (action !== InputAction.Confirm && action !== InputAction.Interact && action !== InputAction.Cancel) {
      return;
    }
    if (this.lore && this.revealed < this.lore.body.length) {
      // First press finishes the reveal; second dismisses.
      this.revealed = this.lore.body.length;
      return;
    }
    this.game.machine.pop();
  }
}
