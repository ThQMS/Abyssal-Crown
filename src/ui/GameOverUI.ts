import { withAlpha } from '@/utils/ColorUtils';

export interface RunSummary {
  depth: number;
  level: number;
  enemiesDefeated: number;
  puzzlesSolved: number;
}

/** Tela de morte com um resumo curto da jornada. */
export class GameOverUI {
  render(
    ctx: CanvasRenderingContext2D,
    summary: RunSummary,
    timeMs: number,
    width: number,
    height: number,
  ): void {
    ctx.fillStyle = withAlpha('#000000', 0.85);
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d83a3a';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('VOCÊ CAIU', width / 2, height * 0.32);

    ctx.fillStyle = '#c8c4d8';
    ctx.font = '18px system-ui, sans-serif';
    const lines = [
      `Andar alcançado: ${summary.depth}`,
      `Nível do personagem: ${summary.level}`,
      `Inimigos derrotados: ${summary.enemiesDefeated}`,
      `Puzzles resolvidos: ${summary.puzzlesSolved}`,
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height * 0.45 + i * 30);
    });

    ctx.fillStyle = withAlpha('#e8e8f0', 0.6 + Math.sin(timeMs / 400) * 0.2);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Pressione Enter para voltar à superfície', width / 2, height * 0.8);
  }
}
