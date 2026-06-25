import { withAlpha } from '@/utils/ColorUtils';
import type { Rect } from '@/types';

/** Identidade de cada linha do menu de opções. */
export type SettingsKey = 'volume' | 'sound' | 'fullscreen' | 'save' | 'quit' | 'back';

export interface SettingsRow {
  key: SettingsKey;
  label: string;
}

export interface SettingsView {
  rows: SettingsRow[];
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  selected: number;
  title: string;
  /** Mensagem transitória (ex.: "Jogo salvo."). */
  message: string;
}

const ROW_W = 380;
const ROW_H = 44;
const ROW_GAP = 10;

/** Retângulos clicáveis de cada linha (compartilhado com o hit-test). */
export function settingsLayout(width: number, height: number, count: number): Rect[] {
  const startY = height * 0.32;
  return Array.from({ length: count }, (_, i) => ({
    x: width / 2 - ROW_W / 2,
    y: startY + i * (ROW_H + ROW_GAP),
    width: ROW_W,
    height: ROW_H,
  }));
}

/** Tela de opções/pausa: volume, som, tela cheia e (em jogo) salvar/sair. */
export class SettingsUI {
  render(ctx: CanvasRenderingContext2D, view: SettingsView, width: number, height: number): void {
    ctx.fillStyle = withAlpha('#08080e', 0.94);
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#b46aff';
    ctx.font = 'bold 32px Georgia, serif';
    ctx.fillText(view.title, width / 2, height * 0.2);

    if (view.message) {
      ctx.fillStyle = '#7ad88a';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(view.message, width / 2, height * 0.2 + 26);
    }

    const rects = settingsLayout(width, height, view.rows.length);
    view.rows.forEach((row, i) => {
      const r = rects[i] as Rect;
      const sel = i === view.selected;
      ctx.fillStyle = sel ? withAlpha('#2a2040', 0.95) : withAlpha('#14121c', 0.85);
      ctx.strokeStyle = sel ? '#b46aff' : '#3a3450';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = sel ? '#ffd86a' : '#a8a8c0';
      ctx.font = `${sel ? 'bold ' : ''}16px system-ui, sans-serif`;
      ctx.fillText(`${sel ? '▸ ' : '  '}${row.label}`, r.x + 14, r.y + r.height / 2 + 1);

      this.drawValue(ctx, row.key, view, r);
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = withAlpha('#e8e8f0', 0.55);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('↑ ↓ navegar   •   ← → ajustar   •   Enter confirmar   •   Esc voltar', width / 2, height - 28);
  }

  /** Desenha o valor/controle à direita das linhas que têm estado. */
  private drawValue(ctx: CanvasRenderingContext2D, key: SettingsKey, view: SettingsView, r: Rect): void {
    const rightX = r.x + r.width - 14;
    ctx.textBaseline = 'middle';

    if (key === 'volume') {
      const barW = 150;
      const barH = 12;
      const bx = r.x + r.width - barW - 14;
      const by = r.y + r.height / 2 - barH / 2;
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = view.muted ? '#55556a' : '#6a8aff';
      ctx.fillRect(bx, by, barW * view.volume, barH);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(bx + 0.5, by + 0.5, barW, barH);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#c8c4d8';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText(`${Math.round(view.volume * 100)}%`, bx - 8, r.y + r.height / 2 + 1);
      return;
    }

    let text = '';
    let color = '#c8c4d8';
    if (key === 'sound') {
      text = view.muted ? 'Mudo' : 'Ligado';
      color = view.muted ? '#ff8a6a' : '#7ad88a';
    } else if (key === 'fullscreen') {
      text = view.fullscreen ? 'Ativada' : 'Desativada';
      color = view.fullscreen ? '#7ad88a' : '#9aa0c0';
    } else {
      return;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(text, rightX, r.y + r.height / 2 + 1);
  }
}
