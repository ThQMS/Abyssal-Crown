import type { SkillNode } from '@/combat/SkillTree';
import type { ElementName } from '@/types';
import { ELEMENT_COLORS } from '@/combat/ElementSystem';
import { roundRect } from '@/ui/MainMenuUI';
import { withAlpha } from '@/utils/ColorUtils';

/** Nomes de elemento por extenso, para o cabeçalho de cada ramo. */
const ELEMENT_NAMES: Record<ElementName, string> = {
  physical: 'Físico',
  fire: 'Fogo',
  frost: 'Gelo',
  poison: 'Veneno',
  lightning: 'Raio',
  arcane: 'Arcano',
  void: 'Vazio',
};

const CARD_H = 40;
const PITCH = 46;
const TOP = 116;
const HEADER_Y = 100;

interface CardRect {
  x: number;
  y: number;
  w: number;
}

/**
 * Desenha a árvore como **colunas por elemento**: cada ramo (Físico, Fogo, …)
 * desce em sequência pela ordem de pré-requisitos, e os conectores ligam pai →
 * filho verticalmente dentro da mesma coluna (sem linhas cruzadas). O
 * {@link LevelUpState} fornece as colunas já ordenadas e a célula selecionada.
 */
export class SkillTreeUI {
  render(
    ctx: CanvasRenderingContext2D,
    columns: SkillNode[][],
    selCol: number,
    selRow: number,
    points: number,
    equipped: string[],
    message: string,
    width: number,
    height: number,
  ): void {
    ctx.fillStyle = withAlpha('#08080e', 0.96);
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#b46aff';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillText('Constelação de Habilidades', width / 2, 40);

    ctx.fillStyle = points > 0 ? '#e8d86a' : '#7a7a9a';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(
      points > 0 ? `Pontos de habilidade: ${points}` : 'Sem pontos — derrote inimigos e resolva puzzles',
      width / 2,
      64,
    );
    if (message) {
      ctx.fillStyle = '#ffae5a';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(message, width / 2, 84);
    }

    // Geometria das colunas.
    const cols = columns.length;
    if (cols === 0) return;
    const margin = 24;
    const gap = 14;
    const colW = Math.min(152, (width - margin * 2 - gap * (cols - 1)) / cols);
    const totalW = cols * colW + (cols - 1) * gap;
    const startX = (width - totalW) / 2;

    // Posiciona cada card e guarda os retângulos (para os conectores).
    const rects = new Map<string, CardRect>();
    columns.forEach((column, c) => {
      const cx = startX + c * (colW + gap);
      // Cabeçalho do ramo.
      const element = column[0]?.skill.element;
      if (element) {
        ctx.textAlign = 'center';
        ctx.fillStyle = ELEMENT_COLORS[element];
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(ELEMENT_NAMES[element], cx + colW / 2, HEADER_Y);
      }
      column.forEach((node, r) => {
        rects.set(node.skill.id, { x: cx, y: TOP + r * PITCH, w: colW });
      });
    });

    // Conectores: só dentro da MESMA coluna (linhas verticais, sem cruzamento).
    columns.forEach((column) => {
      const ids = new Set(column.map((n) => n.skill.id));
      for (const node of column) {
        const to = rects.get(node.skill.id);
        if (!to) continue;
        for (const req of node.skill.requires) {
          if (!ids.has(req)) continue; // pré-requisito de outro ramo: sem linha
          const from = rects.get(req);
          if (!from) continue;
          ctx.strokeStyle = withAlpha(node.unlocked ? ELEMENT_COLORS[node.skill.element] : '#3a3450', 0.7);
          ctx.lineWidth = node.unlocked ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(from.x + from.w / 2, from.y + CARD_H);
          ctx.lineTo(to.x + to.w / 2, to.y);
          ctx.stroke();
        }
      }
    });
    ctx.lineWidth = 1;

    // Cards por cima dos conectores.
    columns.forEach((column, c) => {
      column.forEach((node, r) => {
        const rect = rects.get(node.skill.id);
        if (!rect) return;
        const slot = equipped.indexOf(node.skill.id);
        this.drawCard(ctx, node, c === selCol && r === selRow, slot, rect);
      });
    });

    this.drawLegend(ctx, width, height);
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    node: SkillNode,
    isSelected: boolean,
    equippedSlot: number,
    rect: CardRect,
  ): void {
    const { x, y, w } = rect;
    const accent = ELEMENT_COLORS[node.skill.element];
    ctx.fillStyle = node.unlocked ? withAlpha(accent, 0.22) : '#14121c';
    ctx.strokeStyle = isSelected
      ? '#ffffff'
      : node.available
        ? accent
        : node.unlocked
          ? withAlpha(accent, 0.6)
          : '#2a2a3a';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, CARD_H, 6);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = node.unlocked ? '#ffffff' : node.available ? accent : '#8a8aa0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(truncate(node.skill.name, fitChars(w)), x + 10, y + 17);

    ctx.fillStyle = withAlpha(accent, 0.9);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${node.skill.mpCost} MP`, x + 10, y + 31);

    const state = node.unlocked ? 'Desbloqueada' : node.available ? 'Disponível' : 'Bloqueada';
    ctx.textAlign = 'right';
    ctx.fillStyle = node.unlocked ? '#7ad88a' : node.available ? '#e8d86a' : '#55556a';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(state, x + w - 8, y + 31);

    if (equippedSlot >= 0) {
      ctx.fillStyle = '#ffd86a';
      ctx.fillRect(x + w - 22, y + 5, 16, 14);
      ctx.fillStyle = '#1a1320';
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${equippedSlot + 1}`, x + w - 14, y + 15);
    }
  }

  private drawLegend(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = withAlpha('#e8e8f0', 0.85);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      '↑↓ descer no ramo  •  ←→ trocar de ramo  •  Enter: desbloquear (1 ponto) ou equipar/desequipar (4 slots)  •  Esc fechar',
      width / 2,
      height - 30,
    );
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#7a7a9a';
    ctx.fillText(
      'Disponível = pronta p/ desbloquear  ·  Desbloqueada = aprendida  ·  número = slot de combate equipado',
      width / 2,
      height - 14,
    );
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Quantos caracteres do nome cabem na largura do card. */
function fitChars(cardW: number): number {
  return Math.max(8, Math.floor((cardW - 20) / 6.5));
}
