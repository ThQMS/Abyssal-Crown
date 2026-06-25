import { rarityColor, spriteOf, defOf } from '@/items/ItemText';
import { withAlpha } from '@/utils/ColorUtils';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import type { ItemInstance } from '@/types';

/**
 * Desenha o ícone de um item num quadrado `size`×`size`. Usa o sprite do pacote
 * 0x72 quando existe; caso contrário (ex.: armaduras/acessórios sem arte),
 * desenha um placeholder colorido pela raridade com a inicial do tipo.
 */
export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteRegistry,
  instance: ItemInstance,
  x: number,
  y: number,
  size: number,
): void {
  const frame = sprites.getFrame(spriteOf(instance));
  if (frame) {
    ctx.drawImage(frame, x, y, size, size);
    return;
  }

  // Placeholder: quadrado tingido pela raridade + inicial do tipo de item.
  const color = rarityColor(instance);
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.25);
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = color;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.floor(size * 0.6)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kindInitial(instance), x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

function kindInitial(instance: ItemInstance): string {
  const kind = defOf(instance)?.kind;
  if (kind === 'armor') return 'A';
  if (kind === 'relic') return 'R';
  if (kind === 'weapon') return 'W';
  return '?';
}
