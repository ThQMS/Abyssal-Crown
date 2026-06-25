import { withAlpha } from '@/utils/ColorUtils';
import { drawItemIcon } from '@/ui/ItemIcon';
import {
  affixSummary,
  consumableEffect,
  defOf,
  equipmentStats,
  formatStat,
  isEquipment,
  nameOf,
  rarityColor,
  rarityLabel,
} from '@/items/ItemText';
import { EquipmentSlot } from '@/types';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import type { EquipmentSlotName, ItemInstance, Stats } from '@/types';

export interface InventoryView {
  inventory: ItemInstance[];
  equipment: Partial<Record<EquipmentSlotName, ItemInstance>>;
  slots: EquipmentSlotName[];
  column: 'slots' | 'items';
  slotIndex: number;
  itemIndex: number;
  stats: Stats;
}

const SLOT_LABELS: Record<EquipmentSlotName, string> = {
  [EquipmentSlot.Weapon]: 'Arma',
  [EquipmentSlot.Armor]: 'Armadura',
  [EquipmentSlot.Accessory]: 'Acessório',
};

const BORDER = '#4a3f6b';
const SELECTED = '#ffd86a';
/** Máximo de linhas visíveis na lista do inventário. */
const VISIBLE_ROWS = 9;

/** Tela de inventário: slots equipados (esquerda) + mochila (direita). */
export class InventoryUI {
  private readonly sprites: SpriteRegistry;

  constructor(sprites: SpriteRegistry) {
    this.sprites = sprites;
  }

  render(ctx: CanvasRenderingContext2D, view: InventoryView, width: number, height: number): void {
    ctx.fillStyle = withAlpha('#08080e', 0.92);
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('Inventário', 40, 50);

    this.drawVitals(ctx, view, width - 40 - 220, 22, 220);
    this.drawSlots(ctx, view, 40, 80, 300);
    this.drawList(ctx, view, 360, 80, width - 360 - 40);
    this.drawDetail(ctx, view, 40, height - 132, width - 80);

    ctx.fillStyle = withAlpha('#e8e8f0', 0.5);
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      '↑↓ navegar • ←/→ trocar coluna • Enter equipar/usar ou desequipar • I/Esc fechar',
      width / 2,
      height - 16,
    );
  }

  /** Vida e mana atuais — ajudam a decidir quando usar poção. */
  private drawVitals(ctx: CanvasRenderingContext2D, view: InventoryView, x: number, y: number, w: number): void {
    const s = view.stats;
    this.drawVitalBar(ctx, x, y, w, 'HP', s.hp, s.maxHp, '#3ad84a');
    this.drawVitalBar(ctx, x, y + 24, w, 'Mana', s.mp, s.maxMp, '#6060e0');
  }

  private drawVitalBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    label: string,
    value: number,
    max: number,
    color: string,
  ): void {
    const h = 16;
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label}: ${Math.max(0, value)}/${max}`, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawSlots(ctx: CanvasRenderingContext2D, view: InventoryView, x: number, y: number, w: number): void {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8c4d8';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('Equipado', x, y - 6);

    const h = 56;
    const gap = 10;
    view.slots.forEach((slot, i) => {
      const sy = y + i * (h + gap);
      const selected = view.column === 'slots' && i === view.slotIndex;
      ctx.fillStyle = withAlpha('#14121c', 0.95);
      ctx.fillRect(x, sy, w, h);
      ctx.strokeStyle = selected ? SELECTED : BORDER;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 0.5, sy + 0.5, w, h);
      ctx.lineWidth = 1;

      ctx.fillStyle = '#8a8aa0';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(SLOT_LABELS[slot], x + 8, sy + 14);

      const inst = view.equipment[slot];
      if (inst) {
        drawItemIcon(ctx, this.sprites, inst, x + 8, sy + 22, 26);
        ctx.fillStyle = rarityColor(inst);
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillText(nameOf(inst), x + 42, sy + 32);
        ctx.fillStyle = '#9aa0c0';
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(affixSummary(inst) || rarityLabel(inst), x + 42, sy + 47);
      } else {
        ctx.fillStyle = '#55556a';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('— vazio —', x + 42, sy + 34);
      }
    });
  }

  private drawList(ctx: CanvasRenderingContext2D, view: InventoryView, x: number, y: number, w: number): void {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8c4d8';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText(`Mochila (${view.inventory.length})`, x, y - 6);

    if (view.inventory.length === 0) {
      ctx.fillStyle = '#55556a';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Vazia. Derrote inimigos e abra baús.', x, y + 24);
      return;
    }

    const rowH = 34;
    const start = scrollStart(view.itemIndex, view.inventory.length);
    const end = Math.min(view.inventory.length, start + VISIBLE_ROWS);
    for (let i = start; i < end; i++) {
      const inst = view.inventory[i];
      if (!inst) continue;
      const ry = y + (i - start) * rowH;
      const selected = view.column === 'items' && i === view.itemIndex;
      ctx.fillStyle = selected ? withAlpha('#2a2440', 0.95) : withAlpha('#14121c', 0.9);
      ctx.fillRect(x, ry, w, rowH - 4);
      ctx.strokeStyle = selected ? SELECTED : BORDER;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x + 0.5, ry + 0.5, w, rowH - 4);
      ctx.lineWidth = 1;

      drawItemIcon(ctx, this.sprites, inst, x + 6, ry + 3, 24);
      ctx.fillStyle = rarityColor(inst);
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillText(nameOf(inst), x + 38, ry + 13);
      ctx.fillStyle = '#9aa0c0';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(rowSubtitle(inst), x + 38, ry + 26);
    }

    if (view.inventory.length > VISIBLE_ROWS) {
      ctx.fillStyle = '#55556a';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(`${view.itemIndex + 1}/${view.inventory.length}`, x + w - 44, y - 6);
    }
  }

  private drawDetail(ctx: CanvasRenderingContext2D, view: InventoryView, x: number, y: number, w: number): void {
    const h = 96;
    ctx.fillStyle = withAlpha('#14121c', 0.95);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = BORDER;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    const selected = selectedInstance(view);
    if (!selected) {
      ctx.fillStyle = '#55556a';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Selecione um item.', x + 14, y + 28);
      return;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = rarityColor(selected);
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillText(`${nameOf(selected)}  [${rarityLabel(selected)}]`, x + 14, y + 24);

    ctx.fillStyle = '#c8c4d8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(defOf(selected)?.description ?? '', x + 14, y + 44);

    if (isEquipment(selected)) {
      this.drawComparison(ctx, view, selected, x + 14, y + 66);
    } else {
      const def = defOf(selected);
      ctx.fillStyle = '#7ad88a';
      ctx.font = '12px "Courier New", monospace';
      ctx.fillText(def ? consumableEffect(def) : '', x + 14, y + 70);
    }
  }

  /** Mostra os bônus do item selecionado e o delta vs. o que está equipado. */
  private drawComparison(
    ctx: CanvasRenderingContext2D,
    view: InventoryView,
    selected: ItemInstance,
    x: number,
    y: number,
  ): void {
    const stats = equipmentStats(selected);
    if (stats.length === 0) {
      ctx.fillStyle = '#9aa0c0';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText('Sem bônus.', x, y);
      return;
    }

    // Compara com o item já equipado no mesmo slot (se houver e for da mochila).
    const slot = slotFor(selected);
    const equipped = slot ? view.equipment[slot] : undefined;
    const equippedStats = equipped && equipped.uid !== selected.uid ? equipmentStats(equipped) : [];

    let cx = x;
    ctx.font = '12px "Courier New", monospace';
    for (const stat of stats) {
      const label = formatStat(stat);
      const current = equippedStats.find((s) => s.label === stat.label);
      const delta = stat.value - (current?.value ?? 0);
      const arrow = equipped ? (delta > 0 ? ' ▲' : delta < 0 ? ' ▼' : '') : '';
      ctx.fillStyle = delta > 0 ? '#7ad88a' : delta < 0 ? '#ff8a6a' : '#c8c4d8';
      const text = `${label}${arrow}`;
      ctx.fillText(text, cx, y);
      cx += ctx.measureText(text).width + 18;
    }
  }
}

function selectedInstance(view: InventoryView): ItemInstance | undefined {
  if (view.column === 'slots') return view.equipment[view.slots[view.slotIndex] as EquipmentSlotName];
  return view.inventory[view.itemIndex];
}

/** Slot de equipamento de uma instância (espelha Player.slotOf, sem o Player). */
function slotFor(instance: ItemInstance): EquipmentSlotName | undefined {
  const kind = defOf(instance)?.kind;
  if (kind === 'weapon') return EquipmentSlot.Weapon;
  if (kind === 'armor') return EquipmentSlot.Armor;
  if (kind === 'relic') return EquipmentSlot.Accessory;
  return undefined;
}

function rowSubtitle(instance: ItemInstance): string {
  if (isEquipment(instance)) return affixSummary(instance) || rarityLabel(instance);
  const def = defOf(instance);
  return def ? consumableEffect(def) || def.description : '';
}

/** Janela de rolagem que mantém o item selecionado visível. */
function scrollStart(index: number, total: number): number {
  if (total <= VISIBLE_ROWS) return 0;
  const half = Math.floor(VISIBLE_ROWS / 2);
  return Math.max(0, Math.min(index - half, total - VISIBLE_ROWS));
}
