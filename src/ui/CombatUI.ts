import { ELEMENT_COLORS, ElementSystem } from '@/combat/ElementSystem';
import { withAlpha } from '@/utils/ColorUtils';
import { clamp } from '@/utils/MathUtils';
import { Element } from '@/types';
import type { CombatSystem, Combatant } from '@/combat/CombatSystem';
import type { Skill } from '@/combat/Skill';
import type { SpriteRegistry } from '@/engine/SpriteRegistry';
import type { Enemy } from '@/entities/Enemy';
import type { ActiveStatusEffect, ElementName, ItemDefinition, StatusEffectTypeName } from '@/types';

/** Nomes de elemento por extenso, para o painel de descrição. */
const ELEMENT_NAMES: Record<ElementName, string> = {
  physical: 'Físico',
  fire: 'Fogo',
  frost: 'Gelo',
  poison: 'Veneno',
  lightning: 'Raio',
  arcane: 'Arcano',
  void: 'Vazio',
};

/** Rótulos curtos por status, para as fichas no painel do jogador. */
const STATUS_LABELS: Partial<Record<StatusEffectTypeName, string>> = {
  burn: 'Queimando',
  burning: 'Queimando',
  poison: 'Veneno',
  freeze: 'Congelado',
  stun: 'Atordoado',
  shock: 'Choque',
  weaken: 'Fraqueza',
  empowered: 'Fortalecido',
  shield: 'Escudo',
  regen: 'Regen.',
  bleed: 'Sangrando',
};

export type CombatMode = 'menu' | 'target' | 'skill';

export interface CombatView {
  system: CombatSystem;
  mode: CombatMode;
  menu: string[];
  menuIndex: number;
  skills: Skill[];
  skillIndex: number;
  targetIndex: number;
  timeMs: number;
  /** Habilidade já escolhida e aguardando alvo (para a prévia de eficácia). */
  pendingSkill?: Skill;
  /** Consumível que a opção "Item" usaria agora (para a descrição). */
  itemPreview?: ItemDefinition;
  /** Sprite da arma equipada, sobreposto ao herói. */
  playerWeaponSprite?: string;
  /** Filtro CSS de tinte de armadura (por tier), aplicado ao sprite do herói. */
  playerArmorTint?: string;
  /** Turnos de recarga restantes de uma skill (0 = pronta). */
  cooldownOf: (skillId: string) => number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  ageMs: number;
}

/** Estado visual por combatente (barra trailing, flash de dano, morte). */
interface VisualState {
  trailingFrac: number;
  flashMs: number;
  lastHp: number;
  /** Tempo restante da animação de morte (0 = vivo ou já removido). */
  deathMs: number;
  dying: boolean;
}

const PLAYER_POS = { x: 180, y: 270 };
const ENEMY_POS = { x: 560, y: 300 };
const ENEMY_SPACING = 84;
/** Topo mínimo dos sprites inimigos, para não cobrir os painéis do topo. */
const ENEMY_MIN_Y = 196;
const SPRITE = 52;
const FLOATER_LIFE_MS = 1000;
const FLASH_MS = 100;
/** Duração da animação de esvanecer ao morrer. */
const DEATH_MS = 550;
/** Velocidade de drenagem da barra trailing (fração por segundo). */
const TRAIL_SPEED = 0.6;

/** Cores dos números de dano flutuantes por elemento (crítico e cura à parte). */
const DAMAGE_COLORS: Record<ElementName, string> = {
  physical: '#ffffff',
  fire: '#ff6a3a',
  frost: '#6ac8ff',
  poison: '#6ac86a',
  lightning: '#ffe14a',
  arcane: '#b46aff',
  void: '#7a3aff',
};
const CRIT_COLOR = '#ff3a3a';
const HEAL_COLOR = '#7ad88a';

const PANEL_BG = withAlpha('#14121c', 0.82);
const PANEL_BORDER = '#4a3f6b';

/**
 * Renderiza a tela de combate por turnos (800x600): arena com os sprites do
 * pacote 0x72 ao centro, painéis fixos de status (jogador embaixo à esquerda,
 * inimigos no topo à direita), painel de descrição da ação em foco, log e
 * números de dano flutuantes.
 */
export class CombatUI {
  private readonly sprites: SpriteRegistry;
  private readonly floaters: Floater[] = [];
  private readonly visuals = new Map<number, VisualState>();
  private readonly positions = new Map<number, { x: number; y: number }>();
  private lastTimeMs = 0;
  /** Tremor de tela restante (ms), acionado por golpes críticos. */
  private shakeMs = 0;

  constructor(sprites: SpriteRegistry) {
    this.sprites = sprites;
  }

  /** Limpa o estado visual ao iniciar um novo combate. */
  reset(): void {
    this.floaters.length = 0;
    this.visuals.clear();
    this.positions.clear();
    this.lastTimeMs = 0;
    this.shakeMs = 0;
  }

  /** True enquanto algum inimigo ainda está esvanecendo (animação de morte). */
  get hasDyingEnemies(): boolean {
    for (const vs of this.visuals.values()) {
      if (vs.dying && vs.deathMs > 0) return true;
    }
    return false;
  }

  /** Enfileira um número de dano (ou cura) flutuante sobre o alvo. */
  pushDamage(targetId: number, amount: number, element: ElementName, crit: boolean, heal = false): void {
    const pos = this.positions.get(targetId) ?? PLAYER_POS;
    const color = heal ? HEAL_COLOR : crit ? CRIT_COLOR : DAMAGE_COLORS[element] ?? '#ffffff';
    if (crit) this.shakeMs = 260; // tremor de tela no golpe crítico
    this.floaters.push({
      x: pos.x + SPRITE / 2,
      y: pos.y - 6,
      text: heal ? `+${amount}` : crit ? `${amount}!` : String(amount),
      color,
      ageMs: 0,
    });
  }

  render(ctx: CanvasRenderingContext2D, view: CombatView, width: number, height: number): void {
    const dt = clamp(view.timeMs - this.lastTimeMs, 0, 100);
    this.lastTimeMs = view.timeMs;
    this.step(view.system, dt);

    ctx.save();
    if (this.shakeMs > 0) {
      const amp = (this.shakeMs / 260) * 6;
      const ox = Math.sin(view.timeMs / 18) * amp;
      const oy = Math.cos(view.timeMs / 13) * amp;
      ctx.translate(ox, oy);
    }

    this.drawBackdrop(ctx, width, height);
    this.drawPlayer(ctx, view);
    this.drawAllies(ctx, view);
    this.drawEnemies(ctx, view);
    this.drawLog(ctx, view.system);
    this.drawEnemyPanels(ctx, view, width);
    this.drawPlayerPanel(ctx, view, height);
    this.drawActionArea(ctx, view, width, height);
    this.drawFloaters(ctx);
    ctx.restore();
  }

  // --- Atualização de estado visual -----------------------------------------

  private step(system: CombatSystem, dt: number): void {
    const dtSec = dt / 1000;
    if (this.shakeMs > 0) this.shakeMs = Math.max(0, this.shakeMs - dt);
    for (const c of [system.player, ...system.allies, ...system.enemies] as Combatant[]) {
      const frac = c.stats.maxHp > 0 ? c.stats.hp / c.stats.maxHp : 0;
      let vs = this.visuals.get(c.id);
      if (!vs) {
        vs = { trailingFrac: frac, flashMs: 0, lastHp: c.stats.hp, deathMs: 0, dying: false };
        this.visuals.set(c.id, vs);
      }
      // Detecta dano para acionar o flash branco.
      if (c.stats.hp < vs.lastHp) vs.flashMs = FLASH_MS;
      // Detecta a morte (uma vez) para iniciar o esvanecer.
      if (c.stats.hp <= 0 && c !== system.player && !vs.dying) {
        vs.dying = true;
        vs.deathMs = DEATH_MS;
      }
      if (vs.dying) vs.deathMs = Math.max(0, vs.deathMs - dt);
      vs.lastHp = c.stats.hp;
      vs.flashMs = Math.max(0, vs.flashMs - dt);
      // Barra trailing drena devagar em direção ao valor real.
      if (vs.trailingFrac > frac) vs.trailingFrac = Math.max(frac, vs.trailingFrac - TRAIL_SPEED * dtSec);
      else vs.trailingFrac = frac;
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i] as Floater;
      f.ageMs += dt;
      if (f.ageMs >= FLOATER_LIFE_MS) this.floaters.splice(i, 1);
    }
  }

  // --- Cenário e combatentes ------------------------------------------------

  private drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#161020');
    grad.addColorStop(1, '#0a0810');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Borda arcana.
    ctx.strokeStyle = PANEL_BORDER;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.lineWidth = 1;
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, view: CombatView): void {
    const player = view.system.player;
    this.positions.set(player.id, PLAYER_POS);
    this.drawCombatantSprite(
      ctx,
      player.sprite,
      PLAYER_POS.x,
      PLAYER_POS.y,
      view.timeMs,
      player.id,
      false,
      1,
      view.playerArmorTint,
    );
    if (view.playerWeaponSprite) {
      this.drawWeapon(ctx, view.playerWeaponSprite, PLAYER_POS.x, PLAYER_POS.y);
    }
  }

  /** Sobrepõe o sprite da arma equipada à frente do herói (lado dos inimigos). */
  private drawWeapon(ctx: CanvasRenderingContext2D, spriteBase: string, x: number, y: number): void {
    const frame = this.sprites.getFrame(spriteBase);
    if (!frame) return;
    // Escala pela ALTURA para não ficar gigante; mantém proporção.
    const targetH = SPRITE * 0.7;
    const scale = targetH / frame.height;
    const w = frame.width * scale;
    const h = targetH;
    // O sprite do herói tem ~1.75× a largura de altura; a "mão" fica ~95% abaixo
    // do topo e à frente (lado dos inimigos).
    const wx = x + SPRITE * 0.72;
    const wy = y + SPRITE * 0.95;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(0.35);
    ctx.drawImage(frame, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Aliados invocados, à frente do herói, com HP e turnos restantes. */
  private drawAllies(ctx: CanvasRenderingContext2D, view: CombatView): void {
    const allies = view.system.livingAllies;
    allies.forEach((ally, i) => {
      const x = PLAYER_POS.x + 100 + i * 72;
      const y = PLAYER_POS.y + 36;
      this.positions.set(ally.id, { x, y });
      this.drawCombatantSprite(ctx, ally.sprite, x, y, view.timeMs, ally.id, false, 1);

      const bw = 56;
      ctx.font = '9px "Courier New", monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#bfe0ff';
      ctx.fillText(ally.name, x, y - 16);
      this.drawHpBar(ctx, ally, x, y - 12, bw, 6, '#5aa0ff');
    });
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, view: CombatView): void {
    const living = view.system.livingEnemies;
    const positionForLiving = this.enemyLayout(living.length);

    // Desenha os vivos nas posições calculadas.
    living.forEach((enemy, i) => {
      const pos = positionForLiving(i);
      this.positions.set(enemy.id, pos);
      const targeting = view.mode === 'target' && Math.min(view.targetIndex, living.length - 1) === i;

      if (targeting) {
        ctx.save();
        ctx.shadowColor = '#ff5a5a';
        ctx.shadowBlur = 16;
      }
      this.drawCombatantSprite(ctx, enemy.sprite, pos.x, pos.y, view.timeMs, enemy.id, true, 1);
      if (targeting) ctx.restore();
    });

    // Desenha os mortos ainda esvanecendo, na última posição conhecida.
    for (const enemy of view.system.enemies) {
      if (enemy.isAlive()) continue;
      const vs = this.visuals.get(enemy.id);
      if (!vs || !vs.dying || vs.deathMs <= 0) continue;
      const pos = this.positions.get(enemy.id);
      if (!pos) continue;
      const alpha = vs.deathMs / DEATH_MS;
      this.drawCombatantSprite(ctx, enemy.sprite, pos.x, pos.y - (1 - alpha) * 10, view.timeMs, enemy.id, true, alpha);
    }
  }

  /** Retorna uma função que dá a posição de tela do i-ésimo inimigo vivo. */
  private enemyLayout(count: number): (i: number) => { x: number; y: number } {
    const startY = Math.max(ENEMY_MIN_Y, ENEMY_POS.y - ((count - 1) * ENEMY_SPACING) / 2);
    return (i: number) => ({ x: ENEMY_POS.x, y: startY + i * ENEMY_SPACING });
  }

  /** Desenha o sprite com piscada branca de dano, alfa de esvanecer e tinte opcional. */
  private drawCombatantSprite(
    ctx: CanvasRenderingContext2D,
    spriteBase: string,
    x: number,
    y: number,
    timeMs: number,
    id: number,
    mirror: boolean,
    alpha: number,
    tint?: string,
  ): void {
    const set = this.sprites.animation(spriteBase, 'idle');
    const count = Math.max(1, set.frames.length);
    const frame = set.frames[Math.floor(timeMs / set.frameDurationMs) % count];
    if (!frame) return;

    const scale = SPRITE / frame.width;
    const w = frame.width * scale;
    const h = frame.height * scale;
    const dx = mirror ? 0 : x;
    const dy = mirror ? 0 : y;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (mirror) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(frame, dx, dy, w, h);
    // Tinte de armadura: redesenha o frame com um filtro de cor (afeta só os
    // pixels do sprite, sem pintar um quadrado de fundo).
    if (tint) {
      ctx.globalAlpha = alpha * 0.55;
      ctx.filter = tint;
      ctx.drawImage(frame, dx, dy, w, h);
      ctx.filter = 'none';
      ctx.globalAlpha = alpha;
    }
    const flash = this.visuals.get(id)?.flashMs ?? 0;
    if (flash > 0) {
      ctx.globalAlpha = alpha * Math.min(0.85, flash / FLASH_MS);
      ctx.filter = 'brightness(5) grayscale(1)';
      ctx.drawImage(frame, dx, dy, w, h);
    }
    ctx.restore();
  }

  // --- Painéis de status ----------------------------------------------------

  /** Painéis dos inimigos no canto superior direito: nome + HP + alvo. */
  private drawEnemyPanels(ctx: CanvasRenderingContext2D, view: CombatView, width: number): void {
    const living = view.system.livingEnemies;
    const w = 230;
    const h = 38;
    const gap = 6;
    const x = width - w - 14;
    const targetIdx = view.mode === 'target' ? Math.min(view.targetIndex, living.length - 1) : -1;

    living.forEach((enemy, i) => {
      const y = 14 + i * (h + gap);
      const targeting = i === targetIdx;
      this.panel(ctx, x, y, w, h, targeting ? '#ffd86a' : PANEL_BORDER);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${targeting ? 'bold ' : ''}12px "Courier New", monospace`;
      ctx.fillStyle = targeting ? '#ffd86a' : '#d8d4e8';
      const marker = targeting ? '▶ ' : '';
      ctx.fillText(`${marker}${enemy.name}`, x + 10, y + 15);

      this.drawHpBar(ctx, enemy, x + 10, y + 21, w - 20, 10, '#d83a3a');
    });
  }

  /** Painel do jogador no canto inferior esquerdo: nome, HP, mana, status. */
  private drawPlayerPanel(ctx: CanvasRenderingContext2D, view: CombatView, height: number): void {
    const player = view.system.player;
    const w = 250;
    const h = 138;
    const x = 14;
    const y = height - h - 12;
    this.panel(ctx, x, y, w, h, PANEL_BORDER);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.fillText('Você', x + 14, y + 24);

    const barX = x + 14;
    const barW = w - 28;
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = '#9a9ab0';
    ctx.fillText('HP', barX, y + 40);
    this.drawHpBar(ctx, player, barX, y + 44, barW, 14, '#3ad84a');

    ctx.fillStyle = '#9a9ab0';
    ctx.fillText('Mana', barX, y + 70);
    this.drawManaBar(ctx, player, barX, y + 74, barW, 12);

    this.drawStatuses(ctx, player.activeEffects, barX, y + 98, barW);
  }

  /** Fichas dos status ativos (nome + turnos restantes). */
  private drawStatuses(
    ctx: CanvasRenderingContext2D,
    effects: ActiveStatusEffect[],
    x: number,
    y: number,
    maxW: number,
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '10px "Courier New", monospace';
    if (effects.length === 0) {
      ctx.fillStyle = '#6a6a7a';
      ctx.fillText('Sem efeitos ativos', x, y + 8);
      return;
    }

    let cx = x;
    let cy = y + 8;
    for (const effect of effects) {
      const label = `${STATUS_LABELS[effect.type] ?? effect.type} ${effect.turnsRemaining}`;
      const chipW = ctx.measureText(label).width + 12;
      if (cx + chipW > x + maxW) {
        cx = x;
        cy += 18;
      }
      ctx.fillStyle = withAlpha('#4a3f6b', 0.6);
      ctx.fillRect(cx, cy - 7, chipW, 15);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.strokeRect(cx + 0.5, cy - 6.5, chipW, 15);
      ctx.fillStyle = '#d8d4e8';
      ctx.fillText(label, cx + 6, cy + 1);
      cx += chipW + 6;
    }
  }

  private drawHpBar(
    ctx: CanvasRenderingContext2D,
    c: Combatant,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ): void {
    const frac = c.stats.maxHp > 0 ? clamp(c.stats.hp / c.stats.maxHp, 0, 1) : 0;
    const trail = this.visuals.get(c.id)?.trailingFrac ?? frac;

    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(x, y, w, h);
    // Barra trailing (vermelho pálido) mostra o dano recém-sofrido drenando.
    ctx.fillStyle = withAlpha('#ff6a6a', 0.55);
    ctx.fillRect(x, y, w * trail, h);
    // Barra da frente: HP atual.
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(9, h - 4)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.max(0, c.stats.hp)}/${c.stats.maxHp}`, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawManaBar(
    ctx: CanvasRenderingContext2D,
    c: Combatant,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const frac = c.stats.maxMp > 0 ? clamp(c.stats.mp / c.stats.maxMp, 0, 1) : 0;
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6060e0';
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.fillStyle = '#cfcfe8';
    ctx.font = `${Math.max(8, h - 4)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.max(0, c.stats.mp)}/${c.stats.maxMp}`, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** Fundo semitransparente + borda arcana, base de todos os painéis. */
  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border: string): void {
    ctx.fillStyle = PANEL_BG;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  // --- Log, descrição e ações -----------------------------------------------

  private drawLog(ctx: CanvasRenderingContext2D, system: CombatSystem): void {
    const recent = system.log.slice(-4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '11px "Courier New", monospace';
    recent.forEach((line, i) => {
      const alpha = 0.45 + (i / Math.max(1, recent.length)) * 0.55;
      ctx.fillStyle = withAlpha(logColor(line), alpha);
      ctx.fillText(line, 20, 26 + i * 15);
    });
  }

  /** Painel de descrição (esquerda) + menu/botões de ação (direita), no rodapé. */
  private drawActionArea(ctx: CanvasRenderingContext2D, view: CombatView, width: number, height: number): void {
    const x = 278;
    const w = width - x - 14;

    // Painel de descrição da ação em foco.
    const descH = 78;
    const descY = height - 12 - descH - 50 - 8;
    this.panel(ctx, x, descY, w, descH, PANEL_BORDER);
    this.drawDescription(ctx, view, x + 12, descY + 6, w - 24);

    // Linha de ações (menu, botões de skill ou dicas de alvo).
    const rowY = height - 12 - 50;
    if (view.mode === 'skill') {
      this.drawSkillButtons(ctx, view, x, rowY, w, 50);
    } else {
      this.drawActionRow(ctx, view, x, rowY, w, 50);
    }
  }

  private drawActionRow(
    ctx: CanvasRenderingContext2D,
    view: CombatView,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    this.panel(ctx, x, y, w, h, PANEL_BORDER);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '14px "Courier New", monospace';

    if (view.mode === 'target') {
      const hints = ['↑↓ alvo', 'Enter confirmar', 'Esc voltar'];
      const step = w / hints.length;
      hints.forEach((label, i) => {
        ctx.fillStyle = '#c8c4d8';
        ctx.fillText(label, x + 12 + i * step, y + h / 2);
      });
      return;
    }

    const labels = view.menu;
    const step = w / labels.length;
    labels.forEach((label, i) => {
      const sel = i === view.menuIndex;
      ctx.fillStyle = sel ? '#ffd86a' : '#8a8aa0';
      ctx.fillText(`${sel ? '▶ ' : '  '}${label}`, x + 12 + i * step, y + h / 2);
    });
  }

  /** Quatro botões de habilidade: nome, custo de mana e cooldown. */
  private drawSkillButtons(
    ctx: CanvasRenderingContext2D,
    view: CombatView,
    areaX: number,
    areaY: number,
    areaW: number,
    areaH: number,
  ): void {
    const count = 4;
    const gap = 8;
    const bw = (areaW - (count - 1) * gap) / count;
    const bh = areaH;
    const pad = 7;
    const innerW = bw - pad * 2;

    for (let i = 0; i < count; i++) {
      const x = areaX + i * (bw + gap);
      const skill = view.skills[i];
      const sel = i === view.skillIndex;

      ctx.fillStyle = sel ? 'rgba(74,63,107,0.9)' : PANEL_BG;
      ctx.fillRect(x, areaY, bw, bh);
      ctx.strokeStyle = skill ? (sel ? '#ffd86a' : PANEL_BORDER) : '#2a2a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, areaY + 0.5, bw, bh);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (skill) {
        const cd = view.cooldownOf(skill.id);
        // Nome: trunca com reticências para nunca vazar do botão.
        ctx.fillStyle = sel ? '#ffffff' : cd > 0 ? '#6a6a7a' : ELEMENT_COLORS[skill.element];
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillText(this.ellipsize(ctx, `${i + 1}. ${skill.name}`, innerW), x + pad, areaY + 17);

        // Linha inferior: custo de mana (esq.) e prontidão/recarga (dir.).
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = '#6a8aff';
        ctx.fillText(`Mana ${skill.mpCost}`, x + pad, areaY + 35);
        ctx.textAlign = 'right';
        if (cd > 0) {
          ctx.fillStyle = '#e0a040';
          ctx.fillText(`Recarga ${cd}`, x + bw - pad, areaY + 35);
        } else {
          ctx.fillStyle = '#7ad88a';
          ctx.fillText('Pronto', x + bw - pad, areaY + 35);
        }
      } else {
        ctx.fillStyle = '#555';
        ctx.font = '11px "Courier New", monospace';
        ctx.fillText(`${i + 1}. —`, x + pad, areaY + bh / 2 + 4);
      }
    }
  }

  /** Trunca `text` com reticências para caber em `maxWidth` (fonte já definida). */
  private ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut.trimEnd()}…`;
  }

  /** Texto da opção atualmente em foco (e prévia de eficácia no alvo). */
  private drawDescription(
    ctx: CanvasRenderingContext2D,
    view: CombatView,
    x: number,
    y: number,
    w: number,
  ): void {
    const desc = describeFocus(view);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = desc.color;
    ctx.fillText(desc.title, x, y + 16);

    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = '#c8c4d8';
    let lineY = y + 34;
    const bodyLines = this.wrap(ctx, desc.body, w);
    for (const line of bodyLines.slice(0, 2)) {
      ctx.fillText(line, x, lineY);
      lineY += 14;
    }

    if (desc.stats) {
      ctx.fillStyle = '#9aa0c0';
      ctx.fillText(desc.stats, x, lineY);
      lineY += 14;
    }

    // Prévia de eficácia elemental contra o alvo em foco.
    const eff = this.effectivenessPreview(view);
    if (eff) {
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = eff.color;
      ctx.fillText(eff.label, x, lineY);
    }
  }

  /** Quebra um texto em linhas que cabem em `maxWidth` (fonte já definida). */
  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** Calcula a dica de eficácia (só durante a seleção de alvo). */
  private effectivenessPreview(view: CombatView): { label: string; color: string } | undefined {
    if (view.mode !== 'target') return undefined;
    const living = view.system.livingEnemies;
    if (living.length === 0) return undefined;
    const target = living[Math.min(view.targetIndex, living.length - 1)] as Enemy;
    const element = view.pendingSkill ? view.pendingSkill.element : Element.Physical;
    const mult = ElementSystem.multiplier(element, Element.Physical, target.affinities);
    if (mult >= 1.5) return { label: '★ Super efetivo neste alvo!', color: '#ffd86a' };
    if (mult <= 0.75) return { label: '▽ Pouco efetivo neste alvo...', color: '#ff9a6a' };
    return { label: 'Eficácia normal neste alvo.', color: '#8a8aa0' };
  }

  private drawFloaters(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px "Courier New", monospace';
    for (const f of this.floaters) {
      const t = f.ageMs / FLOATER_LIFE_MS;
      const y = f.y - t * 40;
      const alpha = 1 - t;
      ctx.fillStyle = withAlpha('#000000', alpha * 0.6);
      ctx.fillText(f.text, f.x + 1, y + 1);
      ctx.fillStyle = withAlpha(f.color, alpha);
      ctx.fillText(f.text, f.x, y);
    }
  }
}

interface FocusDescription {
  title: string;
  color: string;
  body: string;
  stats?: string;
}

/** Monta título/descrição/atributos da opção atualmente em foco. */
function describeFocus(view: CombatView): FocusDescription {
  const skill = view.mode === 'skill' ? view.skills[view.skillIndex] : view.pendingSkill;
  if ((view.mode === 'skill' || (view.mode === 'target' && view.pendingSkill)) && skill) {
    return describeSkill(view, skill);
  }

  if (view.mode === 'target') {
    // Selecionando alvo para o ataque básico.
    return {
      title: 'Atacar',
      color: '#ffffff',
      body: 'Ataque físico com a arma equipada.',
      stats: 'Elemento: Físico • Alcance: corpo a corpo',
    };
  }

  const choice = view.menu[view.menuIndex];
  switch (choice) {
    case 'Atacar':
      return {
        title: 'Atacar',
        color: '#ffffff',
        body: 'Ataque físico com a arma equipada. Sem custo de mana.',
        stats: 'Elemento: Físico • Alcance: corpo a corpo',
      };
    case 'Habilidade':
      return {
        title: 'Habilidade',
        color: '#b46aff',
        body:
          view.skills.length > 0
            ? 'Escolha uma magia ou técnica equipada para conjurar.'
            : 'Nenhuma habilidade equipada.',
        stats: view.skills.length > 0 ? 'Enter para abrir a lista de habilidades.' : undefined,
      };
    case 'Item': {
      const item = view.itemPreview;
      if (item) {
        return {
          title: `Item — ${item.name}`,
          color: '#7ad88a',
          body: item.description,
          stats: describeItemEffect(item),
        };
      }
      return {
        title: 'Item',
        color: '#7ad88a',
        body: 'Usa o consumível mais útil do inventário.',
        stats: 'Nenhum consumível útil disponível agora.',
      };
    }
    case 'Defender':
      return {
        title: 'Defender',
        color: '#6ac8ff',
        body: 'Assume postura defensiva, reduzindo o dano recebido pela metade.',
        stats: 'Duração: 2 turnos',
      };
    default:
      return { title: choice ?? '', color: '#c8c4d8', body: '' };
  }
}

function describeSkill(view: CombatView, skill: Skill): FocusDescription {
  const parts: string[] = [`Mana: ${skill.mpCost}`, `Elemento: ${ELEMENT_NAMES[skill.element]}`];
  if (skill.isSupport) {
    if (skill.healPercent > 0) parts.push(`Cura: ${Math.round(skill.healPercent * 100)}% do HP máx.`);
    if (skill.statusType) parts.push(`Efeito: ${STATUS_LABELS[skill.statusType] ?? skill.statusType}`);
  } else {
    parts.push(`Poder: ×${skill.power.toFixed(2)}`);
    if (skill.statusType && skill.statusChance > 0) {
      parts.push(`${STATUS_LABELS[skill.statusType] ?? skill.statusType} ${Math.round(skill.statusChance * 100)}%`);
    }
  }
  parts.push(`Alcance: ${skill.range === 0 ? 'pessoal' : skill.range}`);
  const cd = view.cooldownOf(skill.id);
  if (skill.cooldown > 0) parts.push(cd > 0 ? `Recarga: ${cd}` : `Recarga: ${skill.cooldown}`);

  return {
    title: skill.name,
    color: ELEMENT_COLORS[skill.element],
    body: skill.description,
    stats: parts.join(' • '),
  };
}

/** Resumo curto do efeito de um consumível, a partir dos modificadores. */
function describeItemEffect(item: ItemDefinition): string | undefined {
  const mods = item.modifiers;
  if (!mods) return undefined;
  const out: string[] = [];
  if ((mods.hp ?? 0) > 0) out.push(`+${mods.hp} HP`);
  if ((mods.mp ?? mods.mana ?? 0) > 0) out.push(`+${mods.mp ?? mods.mana} Mana`);
  if ((mods.maxHp ?? 0) > 0) out.push(`+${mods.maxHp} HP máx.`);
  if ((mods.magic ?? 0) > 0) out.push(`+${mods.magic} Magia`);
  if ((mods.attack ?? mods.atk ?? 0) > 0) out.push(`+${mods.attack ?? mods.atk} Ataque`);
  return out.length > 0 ? out.join(' • ') : undefined;
}

/** Escolhe a cor de uma linha do log pelo seu conteúdo. */
function logColor(line: string): string {
  if (line.includes('CRÍTICO')) return '#ff6a6a';
  if (line.includes('Vitória')) return '#ffd86a';
  if (line.includes('derrotado') || line.includes('caiu')) return '#9a9ab0';
  if (line.includes('recuperou') || line.includes('Recuperou')) return '#7ad88a';
  if (line.includes('insuficiente')) return '#ffae5a';
  if (line.includes('SUPER EFETIVO')) return '#ffd86a';
  return '#cfc8e0';
}
