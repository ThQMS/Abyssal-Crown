import { MainMenuUI, menuLayout } from '@/ui/MainMenuUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import { rectContains } from '@/utils/MathUtils';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';

/** Duração da animação de entrada do menu, em ms. */
const INTRO_MS = 900;

/** Seleção de classe. Chegamos aqui pela opção "Jogar" da tela-título. */
export class MainMenuState implements GameState {
  readonly id = GameStateId.MainMenu;
  private readonly game: Game;
  private readonly ui: MainMenuUI;
  private selected = 0;
  private timeMs = 0;
  private introMs = 0;

  constructor(game: Game) {
    this.game = game;
    this.ui = new MainMenuUI(game.sprites);
  }

  enter(): void {
    this.timeMs = 0;
    this.introMs = 0;
    this.selected = 0;
  }

  exit(): void {
    /* nothing to tear down */
  }

  update(dtMs: number): void {
    this.timeMs += dtMs;
    this.introMs = Math.min(INTRO_MS, this.introMs + dtMs);
    this.handleMouse();
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(
      ctx,
      this.game.data.classes,
      this.selected,
      this.timeMs,
      this.game.width,
      this.game.height,
      false,
      1,
      this.introMs / INTRO_MS,
    );
  }

  /** Hover seleciona; clique confirma. Usa o mesmo layout do desenho. */
  private handleMouse(): void {
    const input = this.game.input;
    const layout = menuLayout(this.game.width, this.game.height, this.game.data.classes.length, false);
    const mouse = input.getMousePos();

    const moved = input.didMouseMove();
    for (let i = 0; i < layout.cards.length; i++) {
      if (rectContains(layout.cards[i]!, mouse)) {
        // Só deixa o hover mudar a seleção quando o mouse realmente se mexeu;
        // senão o cursor parado sobre um card sobrescreveria as setas a cada frame.
        if (moved && this.selected !== i) {
          this.selected = i;
          this.game.audio.play('menu');
        }
        if (input.wasClicked()) {
          this.selected = i;
          this.confirm();
        }
        return;
      }
    }
  }

  handleInput(action: InputActionName): void {
    const count = this.game.data.classes.length;
    if (count === 0) return;
    switch (action) {
      case InputAction.MoveLeft:
        this.selected = (this.selected - 1 + count) % count;
        this.game.audio.play('menu');
        break;
      case InputAction.MoveRight:
        this.selected = (this.selected + 1) % count;
        this.game.audio.play('menu');
        break;
      case InputAction.Confirm:
        this.confirm();
        break;
      case InputAction.Cancel:
        this.game.audio.play('menu');
        this.game.machine.change(GameStateId.Title);
        break;
      default:
        break;
    }
  }

  /** Inicia um novo jogo com a classe selecionada. */
  private confirm(): void {
    const klass = this.game.data.classes[this.selected];
    if (klass) {
      this.game.audio.play('success');
      this.game.startNewGame(klass.id);
    }
  }
}
