import { withAlpha } from '@/utils/ColorUtils';
import { clamp } from '@/utils/MathUtils';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import type { Rect } from '@/types';

export interface TitleLayout {
  /** Um retângulo por item de menu, na mesma ordem das opções. */
  items: Rect[];
}

const ITEM_W = 280;
const ITEM_H = 44;
const ITEM_GAP = 12;
const EMBER_COUNT = 46;

/** Calcula os retângulos clicáveis das opções (compartilhado com o hit-test). */
export function titleLayout(width: number, height: number, count: number): TitleLayout {
  const startY = height * 0.54;
  const items: Rect[] = [];
  for (let i = 0; i < count; i++) {
    items.push({ x: width / 2 - ITEM_W / 2, y: startY + i * (ITEM_H + ITEM_GAP), width: ITEM_W, height: ITEM_H });
  }
  return { items };
}

/**
 * Tela-título: a "entrada da masmorra" (portal de pedra com tochas, estandartes e
 * brasas subindo) ao fundo, uma coroa brilhante sobre o nome do jogo e o menu
 * principal (Continuar / Jogar / Configurações).
 */
export class TitleUI {
  private readonly sprites: SpriteRegistry;

  constructor(sprites: SpriteRegistry) {
    this.sprites = sprites;
  }

  render(
    ctx: CanvasRenderingContext2D,
    options: string[],
    selected: number,
    timeMs: number,
    width: number,
    height: number,
    intro: number,
  ): void {
    this.drawBackdrop(ctx, width, height, timeMs);
    this.drawDungeonGate(ctx, width, height, timeMs, intro);
    this.drawEmbers(ctx, width, height, timeMs, intro);

    // Coroa + título — entram primeiro (fade + leve descida).
    const titleAlpha = eased(clamp(intro / 0.5, 0, 1));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    const titleY = height * 0.24 - (1 - titleAlpha) * 16;
    this.drawCrown(ctx, width / 2, titleY - 64, timeMs);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = '#5a2a8a';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#c98aff';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.fillText('ABYSSAL CROWN', width / 2, titleY);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#8a78a8';
    ctx.font = 'italic 17px Georgia, serif';
    ctx.fillText('Desça. Decifre. Sobreviva.', width / 2, titleY + 34);
    ctx.restore();

    this.drawMenu(ctx, options, selected, width, height, intro);

    // Rodapé.
    ctx.save();
    ctx.globalAlpha = intro;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = withAlpha('#e8e8f0', 0.5 + Math.sin(timeMs / 500) * 0.2);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('↑ ↓ navegar   •   Enter selecionar', width / 2, height - 26);
    ctx.restore();
  }

  // --- Fundo e atmosfera ----------------------------------------------------

  private drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0c0a14');
    grad.addColorStop(1, '#050308');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const pulse = 0.16 + Math.sin(timeMs / 1200) * 0.05;
    const vignette = ctx.createRadialGradient(width / 2, height * 0.42, height * 0.12, width / 2, height / 2, height * 0.85);
    vignette.addColorStop(0, `rgba(70,36,108,${pulse})`);
    vignette.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  /** Brasas/motes de luz subindo lentamente, calculadas de forma procedural. */
  private drawEmbers(ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, intro: number): void {
    ctx.save();
    ctx.globalAlpha = eased(clamp((intro - 0.2) / 0.6, 0, 1));
    for (let i = 0; i < EMBER_COUNT; i++) {
      const seed = i * 127.1;
      const colX = frac(Math.sin(seed) * 43758.5);
      const drift = Math.sin(timeMs / 1400 + i) * 14;
      const x = colX * width + drift;
      const speed = 12 + frac(Math.cos(seed) * 1000) * 22;
      const span = height * 0.85;
      const y = height - ((timeMs / 1000) * speed + frac(seed) * span) % span;
      const t = 1 - (height - y) / span; // some perto do topo
      const size = 1 + frac(seed * 3.3) * 1.8;
      const warm = i % 4 === 0;
      ctx.fillStyle = withAlpha(warm ? '#ffb46a' : '#b46aff', 0.15 + t * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * "Entrada da masmorra": um arco de paredes do pacote 0x72 com vão escuro,
   * escada descendo, estandartes, tochas tremeluzentes e brilho arcano no fundo.
   */
  private drawDungeonGate(ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, intro: number): void {
    const tile = 40;
    const cols = 7;
    const rows = 4;
    const gateW = cols * tile;
    const gateH = rows * tile;
    const ox = width / 2 - gateW / 2;
    const oy = height * 0.32;

    ctx.save();
    ctx.globalAlpha = eased(clamp((intro - 0.2) / 0.6, 0, 1)) * 0.95;

    const wall = this.sprites.getFrame('wall_mid') ?? this.sprites.getFrame('wall_1');
    const floor = this.sprites.getFrame('floor_1');
    const stairs = this.sprites.getFrame('floor_stairs');
    const banner = this.sprites.getFrame('wall_banner_red');

    // Vão escuro do portal.
    const innerX = ox + tile;
    const innerY = oy + tile;
    const innerW = gateW - tile * 2;
    const innerH = gateH - tile;
    const depth = ctx.createLinearGradient(0, innerY, 0, innerY + innerH);
    depth.addColorStop(0, '#08060f');
    depth.addColorStop(1, '#1c1438');
    ctx.fillStyle = depth;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Piso/escada.
    if (floor) {
      for (let c = 1; c < cols - 1; c++) ctx.drawImage(floor, ox + c * tile, oy + (rows - 1) * tile, tile, tile);
    }
    if (stairs) ctx.drawImage(stairs, width / 2 - tile / 2, oy + (rows - 1) * tile, tile, tile);

    // Brilho arcano subindo do fundo da escada.
    const glow = 0.28 + Math.sin(timeMs / 700) * 0.12;
    const g = ctx.createRadialGradient(width / 2, oy + gateH, 4, width / 2, oy + gateH, gateH * 0.95);
    g.addColorStop(0, `rgba(150,90,255,${glow})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Moldura de paredes (topo + laterais).
    if (wall) {
      for (let c = 0; c < cols; c++) ctx.drawImage(wall, ox + c * tile, oy, tile, tile);
      for (let r = 1; r < rows; r++) {
        ctx.drawImage(wall, ox, oy + r * tile, tile, tile);
        ctx.drawImage(wall, ox + (cols - 1) * tile, oy + r * tile, tile, tile);
      }
    } else {
      ctx.strokeStyle = '#4a3f6b';
      ctx.lineWidth = 4;
      ctx.strokeRect(ox, oy, gateW, gateH);
    }

    // Estandartes pendurados no topo do arco.
    if (banner) {
      ctx.drawImage(banner, ox + tile, oy + 2, tile, tile * 1.4);
      ctx.drawImage(banner, ox + (cols - 2) * tile, oy + 2, tile, tile * 1.4);
    }

    ctx.restore();

    // Tochas tremeluzentes flanqueando o portal (desenhadas sem sprite).
    this.drawTorch(ctx, ox - 10, oy + tile * 1.4, timeMs, 0);
    this.drawTorch(ctx, ox + gateW + 10, oy + tile * 1.4, timeMs, 1.7);
  }

  /** Tocha: haste + chama pulsante + halo de luz quente tremeluzente. */
  private drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number, phase: number): void {
    const flick = 0.75 + Math.sin(timeMs / 90 + phase) * 0.12 + Math.sin(timeMs / 37 + phase) * 0.06;

    // Halo de luz.
    const halo = ctx.createRadialGradient(x, y, 2, x, y, 90 * flick);
    halo.addColorStop(0, `rgba(255,170,80,${0.28 * flick})`);
    halo.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 96, y - 96, 192, 192);

    // Haste.
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(x - 2, y, 4, 28);

    // Chama (dois cones).
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, flick);
    ctx.fillStyle = withAlpha('#ff7a2a', 0.9);
    flame(ctx, 0, 0, 7, 18);
    ctx.fillStyle = withAlpha('#ffd24a', 0.95);
    flame(ctx, 0, 2, 4, 11);
    ctx.restore();
  }

  /** Coroa estilizada (vetorial) com brilho arcano, sobre o título. */
  private drawCrown(ctx: CanvasRenderingContext2D, cx: number, cy: number, timeMs: number): void {
    const w = 88;
    const h = 40;
    const glow = 0.5 + Math.sin(timeMs / 600) * 0.3;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = `rgba(150,90,255,${glow})`;
    ctx.shadowBlur = 22;

    // Corpo da coroa: base + três picos.
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h * 0.1);
    ctx.lineTo(-w / 4, h * 0.2);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 4, h * 0.2);
    ctx.lineTo(w / 2, -h * 0.1);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, '#ffe89a');
    grad.addColorStop(1, '#c98a3a');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gemas nos picos.
    const gem = (gx: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(gx, -h * 0.18, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    gem(0, '#b46aff');
    gem(-w / 4, '#6ac8ff');
    gem(w / 4, '#6ac8ff');
    ctx.restore();
  }

  private drawMenu(
    ctx: CanvasRenderingContext2D,
    options: string[],
    selected: number,
    width: number,
    height: number,
    intro: number,
  ): void {
    const layout = titleLayout(width, height, options.length);
    options.forEach((label, i) => {
      const r = layout.items[i] as Rect;
      const sel = i === selected;
      const itemIntro = eased(clamp((intro - 0.3 - i * 0.08) / 0.5, 0, 1));
      if (itemIntro <= 0) return;
      ctx.save();
      ctx.globalAlpha = itemIntro;
      if (sel) {
        ctx.shadowColor = '#b46aff';
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = sel ? withAlpha('#2a2040', 0.96) : withAlpha('#14121c', 0.82);
      ctx.strokeStyle = sel ? '#c98aff' : '#3a3450';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.shadowBlur = 0;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = sel ? '#ffd86a' : '#a8a8c0';
      ctx.font = `${sel ? 'bold ' : ''}18px system-ui, sans-serif`;
      ctx.fillText(`${sel ? '▸ ' : ''}${label}`, r.x + r.width / 2, r.y + r.height / 2 + 1);
      ctx.restore();
    });
  }
}

/** Desenha uma "chama" (lágrima invertida) centrada em (x,y). */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.3, x, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.3, x, y - h);
  ctx.closePath();
  ctx.fill();
}

function eased(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

/** Parte fracionária positiva — base dos valores pseudo-aleatórios das brasas. */
function frac(n: number): number {
  return n - Math.floor(n);
}
