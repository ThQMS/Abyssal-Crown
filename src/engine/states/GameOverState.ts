import { GameOverUI, type RunSummary } from '@/ui/GameOverUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';

/** The death screen. Returns to the main menu on confirm. */
export class GameOverState implements GameState {
  readonly id = GameStateId.GameOver;
  private readonly game: Game;
  private readonly ui = new GameOverUI();
  private summary: RunSummary = { depth: 1, level: 1, enemiesDefeated: 0, puzzlesSolved: 0 };
  private timeMs = 0;

  constructor(game: Game) {
    this.game = game;
  }

  enter(): void {
    this.timeMs = 0;
    this.summary = {
      depth: this.game.depth,
      level: this.game.player.stats.level,
      enemiesDefeated: 0,
      puzzlesSolved: this.game.puzzles.serialize().length,
    };
    // Clear the autosave so the run truly ends.
    this.game.saves.delete();
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
    if (action === InputAction.Confirm) {
      this.game.machine.change(GameStateId.Title);
    }
  }
}
