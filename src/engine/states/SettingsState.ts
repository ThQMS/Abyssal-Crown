import { SettingsUI, settingsLayout, type SettingsRow } from '@/ui/SettingsUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import { rectContains } from '@/utils/MathUtils';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';

interface SettingsParams {
  /** True quando aberto durante uma partida (mostra Salvar / Sair para o título). */
  inGame?: boolean;
}

const MESSAGE_MS = 2200;

/** Overlay de opções/pausa: áudio, tela cheia e, em jogo, salvar e sair. */
export class SettingsState implements GameState {
  readonly id = GameStateId.Settings;
  readonly transparent = true;
  private readonly game: Game;
  private readonly ui = new SettingsUI();
  private rows: SettingsRow[] = [];
  private inGame = false;
  private selected = 0;
  private message = '';
  private messageMs = 0;

  constructor(game: Game) {
    this.game = game;
  }

  enter(params?: unknown): void {
    this.inGame = !!(params as SettingsParams)?.inGame;
    this.rows = this.buildRows();
    this.selected = 0;
    this.message = '';
    this.messageMs = 0;
  }

  exit(): void {
    /* nothing */
  }

  update(dtMs: number): void {
    if (this.messageMs > 0) {
      this.messageMs -= dtMs;
      if (this.messageMs <= 0) this.message = '';
    }
    this.handleMouse();
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(
      ctx,
      {
        rows: this.rows,
        volume: this.game.audio.level,
        muted: this.game.audio.isMuted,
        fullscreen: isFullscreen(),
        selected: this.selected,
        title: this.inGame ? 'Pausa' : 'Configurações',
        message: this.message,
      },
      this.game.width,
      this.game.height,
    );
  }

  handleInput(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveUp:
        this.selected = (this.selected - 1 + this.rows.length) % this.rows.length;
        this.game.audio.play('menu');
        break;
      case InputAction.MoveDown:
        this.selected = (this.selected + 1) % this.rows.length;
        this.game.audio.play('menu');
        break;
      case InputAction.MoveLeft:
        this.adjust(-1);
        break;
      case InputAction.MoveRight:
        this.adjust(1);
        break;
      case InputAction.Confirm:
        this.activate();
        break;
      case InputAction.Cancel:
        this.game.machine.pop();
        break;
      default:
        break;
    }
  }

  private buildRows(): SettingsRow[] {
    const rows: SettingsRow[] = [
      { key: 'volume', label: 'Volume' },
      { key: 'sound', label: 'Som' },
      { key: 'fullscreen', label: 'Tela cheia' },
    ];
    if (this.inGame) {
      rows.push({ key: 'save', label: 'Salvar jogo' });
      rows.push({ key: 'quit', label: 'Sair para o título' });
    }
    rows.push({ key: 'back', label: this.inGame ? 'Continuar' : 'Voltar' });
    return rows;
  }

  private handleMouse(): void {
    const rects = settingsLayout(this.game.width, this.game.height, this.rows.length);
    const mouse = this.game.input.getMousePos();
    for (let i = 0; i < rects.length; i++) {
      if (rectContains(rects[i]!, mouse)) {
        if (this.selected !== i) {
          this.selected = i;
          this.game.audio.play('menu');
        }
        if (this.game.input.wasClicked()) this.activate();
        return;
      }
    }
  }

  /** ←/→: só ajusta valores (volume/som/tela cheia); nunca salva/sai sem querer. */
  private adjust(dir: number): void {
    const key = this.rows[this.selected]?.key;
    if (key === 'volume') {
      this.game.audio.resume();
      this.game.audio.setVolume(this.game.audio.level + dir * 0.1);
      this.game.audio.play('menu');
    } else if (key === 'sound' || key === 'fullscreen') {
      this.activate();
    }
  }

  /** Enter/clique: executa a ação da linha atual. */
  private activate(): void {
    const key = this.rows[this.selected]?.key;
    switch (key) {
      case 'sound':
        this.game.audio.resume();
        this.game.audio.toggleMute();
        this.game.audio.play('menu');
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        this.game.audio.play('menu');
        break;
      case 'save':
        this.game.saveGame(true);
        this.game.audio.play('success');
        this.notify('Jogo salvo.');
        break;
      case 'quit':
        this.game.audio.play('menu');
        this.game.machine.change(GameStateId.Title);
        break;
      case 'back':
        this.game.machine.pop();
        break;
      default:
        break;
    }
  }

  private notify(text: string): void {
    this.message = text;
    this.messageMs = MESSAGE_MS;
  }

  private toggleFullscreen(): void {
    try {
      if (isFullscreen()) {
        void document.exitFullscreen();
      } else {
        void this.game.canvas.requestFullscreen();
      }
    } catch {
      /* ambiente sem Fullscreen API: ignora */
    }
  }
}

function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}
