import type { ClassDefinition, Rect } from '@/types';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import { withAlpha } from '@/utils/ColorUtils';
import { clamp } from '@/utils/MathUtils';

/** Regiões clicáveis calculadas a partir das dimensões do canvas. */
export interface MenuLayout {
  /** Retângulo do botão "Continuar" (somente quando há save). */
  continueRect: Rect | null;
  /** Um retângulo por card de classe, na mesma ordem de `classes`. */
  cards: Rect[];
}

const CARD_W = 150;
const CARD_H = 220;
const GAP = 24;

/**
 * Calcula o layout do menu (cards + botão continuar). Compartilhado entre o
 * desenho e o hit-test do mouse, garantindo que clique e render concordem.
 */
export function menuLayout(width: number, height: number, classCount: number, hasSave: boolean): MenuLayout {
  const totalW = classCount * CARD_W + (classCount - 1) * GAP;
  const startX = (width - totalW) / 2;
  const cardY = height * 0.4;

  const cards: Rect[] = [];
  for (let i = 0; i < classCount; i++) {
    cards.push({ x: startX + i * (CARD_W + GAP), y: cardY, width: CARD_W, height: CARD_H });
  }

  const continueRect: Rect | null = hasSave
    ? { x: width / 2 - 130, y: height * 0.3 - 18, width: 260, height: 32 }
    : null;

  return { continueRect, cards };
}

export class MainMenuUI {
  private readonly sprites: SpriteRegistry;

  constructor(sprites: SpriteRegistry) {
    this.sprites = sprites;
  }

  render(
    ctx: CanvasRenderingContext2D,
    classes: ClassDefinition[],
    selected: number,
    timeMs: number,
    width: number,
    height: number,
    hasSave = false,
    menuIndex = 1,
    intro = 1,
  ): void {
    const layout = menuLayout(width, height, classes.length, hasSave);

    // Fundo com vinheta sutil.
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.75);
    vignette.addColorStop(0, 'rgba(40,24,64,0.18)');
    vignette.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Título — entra primeiro (fade + leve descida).
    const titleAlpha = eased(clamp(intro / 0.5, 0, 1));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b46aff';
    ctx.font = 'bold 48px Georgia, serif';
    const titleY = height * 0.2 - (1 - titleAlpha) * 16;
    ctx.fillText('ABYSSAL CROWN', width / 2, titleY);
    ctx.fillStyle = '#6a6a8a';
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('Desça. Decifre. Sobreviva.', width / 2, titleY + height * 0.06);
    ctx.restore();

    // Botão "Continuar".
    if (layout.continueRect) {
      const r = layout.continueRect;
      const sel = menuIndex === 0;
      ctx.save();
      ctx.globalAlpha = eased(clamp((intro - 0.15) / 0.5, 0, 1));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = sel ? '#ffd86a' : '#8a8aa0';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(`${sel ? '▸ ' : ''}Continuar jornada`, r.x + r.width / 2, r.y + r.height / 2);
      ctx.restore();
    }

    // Cards de classe — entram escalonados, deslizando de baixo.
    classes.forEach((klass, i) => {
      const rect = layout.cards[i] as Rect;
      const isSel = i === selected && (!hasSave || menuIndex === 1);
      const cardIntro = eased(clamp((intro - 0.25 - i * 0.08) / 0.5, 0, 1));
      if (cardIntro <= 0) return;
      this.drawCard(ctx, klass, rect, isSel, timeMs, cardIntro);
    });

    // Rodapé com dica de controles (mouse + teclado).
    ctx.save();
    ctx.globalAlpha = intro;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = withAlpha('#e8e8f0', 0.55 + Math.sin(timeMs / 400) * 0.2);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('← → escolher classe   •   Enter confirmar   •   Esc voltar ao título', width / 2, height - 36);
    ctx.restore();
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    klass: ClassDefinition,
    rect: Rect,
    isSel: boolean,
    timeMs: number,
    intro: number,
  ): void {
    const bob = isSel ? Math.sin(timeMs / 250) * 3 : 0;
    const slide = (1 - intro) * 24;

    ctx.save();
    ctx.globalAlpha = intro;
    ctx.translate(0, slide);

    // Moldura do card.
    ctx.fillStyle = isSel ? '#1c1830' : '#14121c';
    ctx.strokeStyle = isSel ? '#b46aff' : '#2a2a3a';
    ctx.lineWidth = isSel ? 2 : 1;
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    if (isSel) {
      ctx.save();
      ctx.shadowColor = '#b46aff';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.stroke();
    }

    // Recorta tudo ao interior do card — nada vaza para fora.
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 8);
    ctx.clip();

    // Sprite animado, encaixado na área superior.
    const set = this.sprites.animation(klass.sprite, 'idle');
    const frame = isSel
      ? set.frames[Math.floor(timeMs / set.frameDurationMs) % Math.max(1, set.frames.length)]
      : set.frames[0];
    const spriteAreaH = 108;
    if (frame) {
      const scale = Math.min(4.5, spriteAreaH / frame.height);
      const w = frame.width * scale;
      const h = frame.height * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame, rect.x + (rect.width - w) / 2, rect.y + 14 + bob, w, h);
    }

    // Nome.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = isSel ? '#e8d8ff' : '#a8a8c0';
    ctx.font = 'bold 15px system-ui, sans-serif';
    const nameY = rect.y + 150;
    wrapText(ctx, klass.name, rect.x + rect.width / 2, nameY, rect.width - 16, 17);

    // Descrição (recortada, limitada a 3 linhas).
    ctx.fillStyle = '#8f8faa';
    ctx.font = '10px system-ui, sans-serif';
    wrapText(ctx, klass.description, rect.x + rect.width / 2, rect.y + 176, rect.width - 18, 12, 3);

    ctx.restore(); // clip
    ctx.restore(); // alpha/translate
  }
}

/** Suavização ease-out cúbica para as animações de entrada. */
function eased(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Quebra texto por largura. `maxLines` corta com reticências se exceder. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Infinity,
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length > 0) {
    let last = shown[shown.length - 1] as string;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    shown[shown.length - 1] = `${last}…`;
  }
  shown.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
}
