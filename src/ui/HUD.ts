import { FogState, StatusEffectType } from '@/types';
import { withAlpha } from '@/utils/ColorUtils';
import type { Player } from '@/entities/Player';
import type { TileMap } from '@/world/TileMap';
import type { StatusEffectTypeName } from '@/types';

/** Cores dos ícones de status, por tipo. */
const STATUS_COLORS: Record<string, string> = {
  [StatusEffectType.Burn]: '#ff6a3a',
  [StatusEffectType.Burning]: '#ff6a3a',
  [StatusEffectType.Poison]: '#6ac86a',
  [StatusEffectType.Freeze]: '#6ac8ff',
  [StatusEffectType.Shock]: '#ffe14a',
  [StatusEffectType.Stun]: '#ffd24a',
  [StatusEffectType.Bleed]: '#d83a3a',
  [StatusEffectType.Shield]: '#8ad8ff',
  [StatusEffectType.Regen]: '#7ad88a',
  [StatusEffectType.Weaken]: '#b46aff',
};

const STATUS_GLYPHS: Record<string, string> = {
  [StatusEffectType.Burn]: 'F',
  [StatusEffectType.Burning]: 'F',
  [StatusEffectType.Poison]: 'V',
  [StatusEffectType.Freeze]: 'G',
  [StatusEffectType.Shock]: 'R',
  [StatusEffectType.Stun]: 'A',
  [StatusEffectType.Bleed]: 'S',
  [StatusEffectType.Shield]: 'E',
  [StatusEffectType.Regen]: '+',
  [StatusEffectType.Weaken]: 'W',
};

/**
 * HUD persistente desenhado inteiramente no canvas (sem HTML): barras de HP/mana,
 * nível/XP, indicador de andar, minimapa, slots de habilidades e ícones de status.
 */
export class HUD {
  /** Fila de avisos: mostrados um de cada vez, em ordem de chegada. */
  private readonly toasts: { text: string; remaining: number }[] = [];
  private clockMs = 0;

  showToast(text: string, durationMs = 2200): void {
    // Evita duplicar a mesma mensagem que já está aguardando/exibindo.
    if (this.toasts.some((t) => t.text === text)) return;
    this.toasts.push({ text, remaining: durationMs });
    // Cap defensivo para não acumular uma fila enorme.
    if (this.toasts.length > 6) this.toasts.splice(0, this.toasts.length - 6);
  }

  update(dtMs: number): void {
    this.clockMs += dtMs;
    const current = this.toasts[0];
    if (current) {
      current.remaining -= dtMs;
      if (current.remaining <= 0) this.toasts.shift();
    }
  }

  render(ctx: CanvasRenderingContext2D, player: Player, floor: number, tilemap: TileMap): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.save();
    this.drawHpBar(ctx, player);
    this.drawManaBar(ctx, player);
    this.drawLevel(ctx, player);
    this.drawStatusEffects(ctx, player);
    this.drawFloor(ctx, floor, width);
    this.drawMinimap(ctx, player, tilemap, width);
    this.drawSkillSlots(ctx, player, width, height);
    this.drawControlsHint(ctx, height);
    this.drawToast(ctx, width);
    ctx.restore();
  }

  /** Lembrete fixo das teclas que abrem as telas de gestão. */
  private drawControlsHint(ctx: CanvasRenderingContext2D, height: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = withAlpha('#e8e8f0', 0.7);
    ctx.fillText('[K] Habilidades   [I] Inventário   [Esc] Menu', 10, height - 12);
  }

  // --- Barras ---------------------------------------------------------------

  private drawHpBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const x = 10, y = 10, w = 160, h = 12;
    const hp = player.stats.hp;
    const maxHp = player.stats.maxHp;
    const frac = maxHp > 0 ? hp / maxHp : 0;
    const color = frac > 0.5 ? '#3ad84a' : frac > 0.25 ? '#e0d040' : '#d83a3a';

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, frac), h);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`HP: ${hp}/${maxHp}`, x + w / 2, y + h / 2 + 1);
  }

  private drawManaBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const x = 10, y = 26, w = 160, h = 8;
    const mp = player.stats.mp;
    const maxMp = player.stats.maxMp;
    const frac = maxMp > 0 ? mp / maxMp : 0;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6060e0';
    ctx.fillRect(x, y, w * Math.max(0, frac), h);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Mana: ${mp}/${maxMp}`, x + w / 2, y + h / 2 + 1);
  }

  private drawLevel(ctx: CanvasRenderingContext2D, player: Player): void {
    ctx.fillStyle = '#cfc8e0';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Nv. ${player.stats.level}  XP: ${player.stats.xp}/${player.stats.xpToNext}`, 10, 46);
  }

  private drawStatusEffects(ctx: CanvasRenderingContext2D, player: Player): void {
    const size = 14;
    let x = 10;
    const y = 52;
    for (const effect of player.activeEffects) {
      const color = STATUS_COLORS[effect.type] ?? '#9a9ab0';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyphFor(effect.type), x + size / 2, y + size / 2 + 1);
      // Contador de turnos restantes.
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(effect.turnsRemaining), x + size, y + size + 7);
      x += size + 6;
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D, floor: number, width: number): void {
    ctx.fillStyle = '#e8d8a0';
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`— Andar ${floor} —`, width / 2, 22);
  }

  // --- Minimapa -------------------------------------------------------------

  private drawMinimap(ctx: CanvasRenderingContext2D, player: Player, tilemap: TileMap, width: number): void {
    const box = 60;
    const ox = width - box - 10;
    const oy = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(ox, oy, box, box);

    const scale = box / Math.max(tilemap.width, tilemap.height);
    const cell = Math.max(1, Math.ceil(scale));

    tilemap.forEach((tile, tx, ty) => {
      let color: string | undefined;
      if (tile.fogState === FogState.Visible) {
        color = tile.isStairs ? '#ffd700' : '#888888';
      } else if (tile.fogState === FogState.Explored || tile.fogState === FogState.Revealed) {
        color = tile.isStairs ? '#ffd700' : '#333333';
      }
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(ox + Math.floor(tx * scale), oy + Math.floor(ty * scale), cell, cell);
    });

    // Jogador: ponto branco piscante (ciclo de 500ms).
    if (this.clockMs % 1000 < 500) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(
        ox + Math.floor(player.x * scale) - 1,
        oy + Math.floor(player.y * scale) - 1,
        cell + 2,
        cell + 2,
      );
    }
  }

  // --- Slots de habilidades -------------------------------------------------

  private drawSkillSlots(ctx: CanvasRenderingContext2D, player: Player, width: number, height: number): void {
    const slot = 40;
    const gap = 8;
    const count = 4;
    const totalW = count * slot + (count - 1) * gap;
    const startX = (width - totalW) / 2;
    const y = height - slot - 10;

    for (let i = 0; i < count; i++) {
      const x = startX + i * (slot + gap);
      const skillId = player.equippedSkills[i];
      const skill = skillId ? player.getSkill(skillId) : null;

      ctx.fillStyle = 'rgba(20,18,28,0.85)';
      ctx.fillRect(x, y, slot, slot);
      ctx.strokeStyle = skill ? '#4a3f6b' : '#2a2a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, slot, slot);

      // Número do slot (1-4).
      ctx.fillStyle = '#c9b8ff';
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), x + 3, y + 3);

      if (skill) {
        ctx.fillStyle = '#e8e8f0';
        ctx.font = '8px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(truncate(skill.name, 7), x + slot / 2, y + slot / 2);
        // Custo de mana, canto inferior direito.
        ctx.fillStyle = '#6a8aff';
        ctx.font = '9px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(skill.manaCost), x + slot - 3, y + slot - 2);
      }
    }
  }

  private drawToast(ctx: CanvasRenderingContext2D, width: number): void {
    const toast = this.toasts[0];
    if (!toast) return;
    const alpha = Math.min(1, toast.remaining / 600);
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(toast.text).width + 24;
    const x = width / 2;
    const y = 44;
    ctx.fillStyle = withAlpha('#12101a', 0.85 * alpha);
    ctx.fillRect(x - tw / 2, y - 14, tw, 22);
    ctx.fillStyle = withAlpha('#e8e8f0', alpha);
    ctx.fillText(toast.text, x, y + 2);
  }
}

function glyphFor(type: StatusEffectTypeName): string {
  return STATUS_GLYPHS[type] ?? '?';
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
