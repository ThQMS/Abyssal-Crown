import { TitleUI, titleLayout } from '@/ui/TitleUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import { rectContains } from '@/utils/MathUtils';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';

const INTRO_MS = 900;

interface MenuItem {
  label: string;
  action: () => void;
}

/** Tela-título: porta de entrada da masmorra com o menu principal do jogo. */
export class TitleState implements GameState {
  readonly id = GameStateId.Title;
  private readonly game: Game;
  private readonly ui: TitleUI;
  private items: MenuItem[] = [];
  private selected = 0;
  private timeMs = 0;
  private introMs = 0;

  constructor(game: Game) {
    this.game = game;
    this.ui = new TitleUI(game.sprites);
  }

  enter(): void {
    this.timeMs = 0;
    this.introMs = 0;
    this.buildItems();
    this.selected = 0;
  }

  exit(): void {
    /* nothing */
  }

  update(dtMs: number): void {
    this.timeMs += dtMs;
    this.introMs = Math.min(INTRO_MS, this.introMs + dtMs);
    this.handleMouse();
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(
      ctx,
      this.items.map((item) => item.label),
      this.selected,
      this.timeMs,
      this.game.width,
      this.game.height,
      this.introMs / INTRO_MS,
    );
  }

  handleInput(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveUp:
        this.selected = (this.selected - 1 + this.items.length) % this.items.length;
        this.game.audio.play('menu');
        break;
      case InputAction.MoveDown:
        this.selected = (this.selected + 1) % this.items.length;
        this.game.audio.play('menu');
        break;
      case InputAction.Confirm:
        this.items[this.selected]?.action();
        break;
      default:
        break;
    }
  }

  /** Hover seleciona; clique confirma. */
  private handleMouse(): void {
    const layout = titleLayout(this.game.width, this.game.height, this.items.length);
    const mouse = this.game.input.getMousePos();
    const moved = this.game.input.didMouseMove();
    for (let i = 0; i < layout.items.length; i++) {
      if (rectContains(layout.items[i]!, mouse)) {
        // Hover só muda a seleção com movimento real do mouse, para não
        // sobrescrever a navegação por teclado a cada frame.
        if (moved && this.selected !== i) {
          this.selected = i;
          this.game.audio.play('menu');
        }
        if (this.game.input.wasClicked()) {
          this.selected = i;
          this.items[i]?.action();
        }
        return;
      }
    }
  }

  /** Monta as opções: "Continuar" só aparece quando há um save. */
  private buildItems(): void {
    this.items = [];
    if (this.game.saves.has()) {
      this.items.push({
        label: 'Continuar jornada',
        action: () => {
          if (this.game.loadGame()) this.game.audio.play('success');
        },
      });
    }
    this.items.push({
      label: 'Jogar',
      action: () => {
        this.game.audio.play('menu');
        this.game.machine.change(GameStateId.MainMenu);
      },
    });
    this.items.push({
      label: 'Configurações',
      action: () => {
        this.game.audio.play('menu');
        this.game.machine.push(GameStateId.Settings);
      },
    });
  }
}
