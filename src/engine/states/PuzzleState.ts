import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import { ItemFactory } from '@/items/ItemFactory';
import { withAlpha } from '@/utils/ColorUtils';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { TerminalLanguage, TerminalPuzzle } from '@/puzzle/ArcaneTerminal';
import type { RunnerTestCase } from '@/puzzle/JsRunner';
import type { PuzzleData, PuzzleResult } from '@/types';

interface PuzzleParams {
  puzzleId: string;
  /** Invocado depois que o puzzle e resolvido (ex.: abrir um bau). */
  onSolved?: () => void;
}

/**
 * Estado-overlay que entrega o controle ao {@link ArcaneTerminal} (DOM). O canvas
 * apenas escurece; o terminal cuida da edicao de texto e da submissao, e resolve
 * uma Promise com o resultado.
 */
export class PuzzleState implements GameState {
  readonly id = GameStateId.Puzzle;
  readonly transparent = true;
  private readonly game: Game;
  private onSolved?: () => void;

  constructor(game: Game) {
    this.game = game;
  }

  enter(params?: unknown): void {
    const { puzzleId, onSolved } = (params as PuzzleParams) ?? { puzzleId: '' };
    this.onSolved = onSolved;

    const data = this.game.puzzles.getData(puzzleId);
    if (!data) {
      this.game.bus.emit('toast', { text: 'O mecanismo esta inerte.' });
      this.game.machine.pop();
      return;
    }

    this.game.bus.emit('puzzle:start', { puzzleId });
    void this.runFlow(data);
  }

  exit(): void {
    // O terminal se esconde sozinho ao resolver/abandonar.
  }

  update(): void {
    /* o terminal e dirigido por eventos */
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = withAlpha('#05050a', 0.6);
    ctx.fillRect(0, 0, this.game.width, this.game.height);
  }

  handleInput(action: InputActionName): void {
    // O textarea captura a maioria das teclas; Cancel e uma rede de seguranca.
    if (action === InputAction.Cancel && !this.game.terminal.isOpen) {
      this.game.machine.pop();
    }
  }

  /** Constroi a visao do terminal, aguarda o resultado e aplica consequencias. */
  private async runFlow(data: PuzzleData): Promise<void> {
    const view = this.buildView(data);
    const result = await this.game.terminal.show(view);

    if (result.solved) {
      this.handleSolved(data.id, result);
    } else {
      this.handleFailed(data.id, result);
    }

    // Salva ao fechar o puzzle (resolvido ou abandonado), exceto se o jogador morreu.
    if (this.game.player.isAlive()) this.game.saveGame(true);

    this.game.machine.pop();

    // Só agora (puzzle já fora da pilha) é seguro o callback empilhar outro
    // estado — ex.: o baú recém-destravado abrir a tela de espólios.
    if (result.solved) this.onSolved?.();
  }

  /** Mapeia uma PuzzleData para a visao consumida pelo terminal. */
  private buildView(data: PuzzleData): TerminalPuzzle {
    const language: TerminalLanguage =
      data.language === 'python' || data.language === 'js' || data.language === 'both'
        ? data.language
        : 'js';
    return {
      id: data.id,
      title: data.title,
      floor: data.floor,
      language,
      lore: data.lore,
      description: data.description,
      starterCode: data.starterCode,
      hint: data.hint,
      // A convencao dos dados e a funcao `solution`.
      functionName: 'solution',
      testCases: data.testCases as RunnerTestCase[],
    };
  }

  private handleSolved(puzzleId: string, result: PuzzleResult): void {
    this.game.puzzles.markSolved(puzzleId, result);
    this.grantReward(puzzleId);
    this.game.audio.play('success');
    if (puzzleId === this.game.level.requiredPuzzleId) {
      this.game.level.unlockStairs();
      this.game.bus.emit('toast', { text: 'As escadas se destrancam.' });
    }
  }

  private handleFailed(puzzleId: string, result: PuzzleResult): void {
    this.game.audio.play('error');
    const penalty = result.penalty ?? 0;
    if (penalty > 0) {
      this.game.player.takeDamage(penalty);
      this.game.bus.emit('toast', { text: `O fracasso custa ${penalty} de vida.` });
      this.game.bus.emit('PUZZLE_FAILED', { puzzleId, result });
      if (!this.game.player.isAlive()) this.game.bus.emit('player:died', undefined);
    }
  }

  private grantReward(puzzleId: string): void {
    const reward = this.game.puzzles.reward(puzzleId);
    if (!reward) return;
    const levels = this.game.player.gainXp(reward.xp);
    if (levels > 0) {
      this.game.skillTree.points += levels;
      this.game.bus.emit('player:levelup', { level: this.game.player.stats.level });
    }
    const items = [...(reward.items ?? []), ...(reward.itemId ? [reward.itemId] : [])];
    for (const itemId of items) {
      this.game.player.addItem(ItemFactory.basic(itemId));
    }
    this.game.bus.emit('toast', { text: `Puzzle resolvido! +${reward.xp} XP.` });
  }
}
