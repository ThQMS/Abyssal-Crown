import { withAlpha } from '@/utils/ColorUtils';
import { affixSummary, defOf, isEquipment, nameOf, rarityColor } from '@/items/ItemText';
import { drawItemIcon } from '@/ui/ItemIcon';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import type { ItemInstance } from '@/types';

export interface LootSummary {
  /** Instâncias dropadas (raridade/afixos já rolados). */
  items: ItemInstance[];
  xp: number;
  leveledUp: boolean;
  /** Título do painel (ex.: "Vitória!" no combate, "Tesouro!" no baú). */
  title: string;
}

/**
 * Tela de espólios exibida ao vencer um combate ou abrir um baú: XP ganho,
 * aviso de nível e a lista de itens dropados com ícone, raridade e bônus.
 */
export class LootUI {
  private readonly sprites: SpriteRegistry;

  constructor(sprites: SpriteRegistry) {
    this.sprites = sprites;
  }

  render(
    ctx: CanvasRenderingContext2D,
    summary: LootSummary,
    timeMs: number,
    width: number,
    height: number,
  ): void {
    ctx.fillStyle = withAlpha('#000000', 0.78);
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(480, width - 80);
    const panelH = Math.min(440, height - 80);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    ctx.fillStyle = withAlpha('#14121c', 0.95);
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = '#4a3f6b';
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1.5, py + 1.5, panelW - 3, panelH - 3);
    ctx.lineWidth = 1;

    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffd86a';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(summary.title, cx, py + 50);

    if (summary.xp > 0) {
      ctx.fillStyle = '#7ad88a';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(`+${summary.xp} XP`, cx, py + 82);
    }
    if (summary.leveledUp) {
      ctx.fillStyle = withAlpha('#ffe14a', 0.7 + Math.sin(timeMs / 220) * 0.3);
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('▲ Subiu de nível!', cx, py + 104);
    }

    const listTop = py + 128;
    ctx.fillStyle = '#c8c4d8';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Espólios', cx, listTop);

    const rows = aggregate(summary.items);
    if (rows.length === 0) {
      ctx.fillStyle = '#8a8aa0';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Nenhum item desta vez.', cx, listTop + 30);
    } else {
      const rowH = 42;
      const rowW = panelW - 80;
      const rowX = px + 40;
      let rowY = listTop + 14;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const row of rows) {
        if (rowY + rowH > py + panelH - 50) break; // não invade o rodapé
        const midY = rowY + (rowH - 6) / 2;
        ctx.fillStyle = withAlpha('#1c1a28', 0.9);
        ctx.fillRect(rowX, rowY, rowW, rowH - 6);
        ctx.strokeStyle = '#3a3450';
        ctx.strokeRect(rowX + 0.5, rowY + 0.5, rowW, rowH - 6);

        drawItemIcon(ctx, this.sprites, row.sample, rowX + 8, midY - 12, 24);

        const suffix = row.count > 1 ? ` ×${row.count}` : '';
        ctx.fillStyle = rarityColor(row.sample);
        ctx.font = 'bold 13px "Courier New", monospace';
        ctx.fillText(`${nameOf(row.sample)}${suffix}`, rowX + 42, midY - 4);

        ctx.fillStyle = '#9aa0c0';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(subtitle(row.sample), rowX + 42, midY + 10);
        rowY += rowH;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = withAlpha('#e8e8f0', 0.6 + Math.sin(timeMs / 400) * 0.2);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Pressione Enter para recolher os espólios', cx, py + panelH - 22);
  }
}

interface LootRow {
  sample: ItemInstance;
  count: number;
}

/** Agrupa consumíveis idênticos; equipamentos (únicos) ficam em linhas próprias. */
function aggregate(items: ItemInstance[]): LootRow[] {
  const rows: LootRow[] = [];
  for (const instance of items) {
    if (!isEquipment(instance)) {
      const existing = rows.find((r) => !isEquipment(r.sample) && r.sample.defId === instance.defId);
      if (existing) {
        existing.count++;
        continue;
      }
    }
    rows.push({ sample: instance, count: 1 });
  }
  return rows;
}

/** Subtítulo da linha: bônus do equipamento ou efeito do consumível. */
function subtitle(instance: ItemInstance): string {
  if (isEquipment(instance)) return affixSummary(instance) || 'Sem bônus extra';
  return defOf(instance)?.description ?? '';
}
