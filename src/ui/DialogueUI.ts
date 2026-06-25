import type { LoreEntry } from '@/types';
import { wrapText } from '@/ui/MainMenuUI';
import { withAlpha } from '@/utils/ColorUtils';

/**
 * A bottom-anchored dialogue / lore box with a typewriter reveal. The owning
 * {@link DialogueState} advances `revealedChars` over time.
 */
export class DialogueUI {
  render(
    ctx: CanvasRenderingContext2D,
    entry: LoreEntry,
    revealedChars: number,
    width: number,
    height: number,
  ): void {
    const boxH = 150;
    const boxY = height - boxH - 20;
    const boxX = 40;
    const boxW = width - 80;

    ctx.fillStyle = withAlpha('#0a0a12', 0.92);
    ctx.strokeStyle = '#3a2a5a';
    ctx.lineWidth = 2;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = 'left';
    if (entry.speaker) {
      ctx.fillStyle = '#b46aff';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.fillText(entry.speaker, boxX + 20, boxY + 28);
    } else {
      ctx.fillStyle = '#9a8acd';
      ctx.font = 'italic 16px Georgia, serif';
      ctx.fillText(entry.title, boxX + 20, boxY + 28);
    }

    const shown = entry.body.slice(0, Math.floor(revealedChars));
    ctx.fillStyle = '#dcd8ec';
    ctx.font = '15px Georgia, serif';
    // textAlign is 'left' here, so pass the left edge as the anchor x.
    wrapText(ctx, shown, boxX + 20, boxY + 56, boxW - 40, 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = withAlpha('#8a8aa0', 0.8);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Enter / E  continuar', boxX + boxW - 16, boxY + boxH - 12);
  }
}
