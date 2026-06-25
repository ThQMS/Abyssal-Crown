import { Animator } from '@/entities/Animator';
import { Element } from '@/types';
import { RENDER_TILE } from '@/engine/SpriteRegistry';
import { clamp } from '@/utils/MathUtils';
import type { Camera } from '@/engine/Camera';
import type { ActiveStatusEffect, DamageResult, ElementName, Point, Stats } from '@/types';

interface SpriteAssets {
  getFrame(key: string): HTMLImageElement | undefined;
}

let nextEntityId = 1;

/** Cria um bloco de stats completo, preservando aliases legados de MP/ataque. */
export function normalizeStats(input: Partial<Stats> = {}): Stats {
  const hp = input.hp ?? input.maxHp ?? 1;
  const maxHp = input.maxHp ?? hp;
  const mana = input.mana ?? input.mp ?? 0;
  const maxMana = input.maxMana ?? input.maxMp ?? mana;
  const atk = input.atk ?? input.attack ?? 1;
  const def = input.def ?? input.defense ?? 0;
  const spd = input.spd ?? input.speed ?? 10;
  const crit = input.crit ?? 0.08;
  const level = input.level ?? 1;
  const xp = input.xp ?? 0;
  const xpToNext = input.xpToNext ?? xpThreshold(level);
  const magic = input.magic ?? atk;
  const resistance = input.resistance ?? def;

  return {
    hp,
    maxHp,
    mana,
    maxMana,
    atk,
    def,
    spd,
    crit,
    level,
    xp,
    xpToNext,
    mp: mana,
    maxMp: maxMana,
    attack: atk,
    defense: def,
    magic,
    resistance,
    speed: spd,
  };
}

export function xpThreshold(level: number): number {
  return 50 + level * level * 25;
}

/**
 * Base abstrata para entidades posicionadas no grid. Mantem tambem aliases
 * historicos (`x`, `y`, `dead`) para compatibilidade com o resto do jogo.
 */
export abstract class Entity {
  readonly id: number;
  position: Point;
  renderPos: Point;
  stats: Stats;
  element: ElementName = Element.Physical;
  activeEffects: ActiveStatusEffect[] = [];
  animator: Animator = new Animator();
  spriteKey: string;
  hitFlashTimer = 0;
  private statusTimerMs = 0;

  glyph: string;
  color: string;
  blocking: boolean;
  dead = false;

  constructor(x: number, y: number, glyph: string, color: string, blocking = false, spriteKey = '') {
    this.id = nextEntityId++;
    this.position = { x, y };
    this.renderPos = { x, y };
    this.stats = normalizeStats();
    this.glyph = glyph;
    this.color = color;
    this.blocking = blocking;
    this.spriteKey = spriteKey;
  }

  get x(): number {
    return this.position.x;
  }

  set x(value: number) {
    this.position.x = value;
  }

  get y(): number {
    return this.position.y;
  }

  set y(value: number) {
    this.position.y = value;
  }

  get sprite(): string {
    return this.spriteKey;
  }

  moveTo(x: number, y: number): void {
    this.renderPos = { ...this.position };
    this.position = { x, y };
  }

  isAt(x: number, y: number): boolean {
    return this.x === x && this.y === y;
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.updateStatusEffects(dt);
  }

  render(ctx: CanvasRenderingContext2D, assets: SpriteAssets, camera: Camera, alpha: number): void {
    const x = this.renderPos.x + (this.position.x - this.renderPos.x) * alpha;
    const y = this.renderPos.y + (this.position.y - this.renderPos.y) * alpha;
    const screen = camera.worldToScreen({ x: x * RENDER_TILE, y: y * RENDER_TILE });
    this.drawSprite(ctx, assets, screen.x, screen.y);
  }

  takeDamage(result: DamageResult | number): number {
    const damage = typeof result === 'number' ? result : result.damage;
    const dealt = Math.max(0, Math.round(damage));
    this.stats.hp = clamp(this.stats.hp - dealt, 0, this.stats.maxHp);
    this.hitFlashTimer = 120;
    this.animator.play(this.stats.hp <= 0 ? 'death' : 'hurt', true);

    if (typeof result !== 'number' && result.statusApplied) {
      this.applyStatus(result.statusApplied);
    }

    if (this.stats.hp <= 0) this.dead = true;
    return dealt;
  }

  isAlive(): boolean {
    return this.stats.hp > 0;
  }

  applyStatus(effect: ActiveStatusEffect): void {
    this.activeEffects = this.activeEffects.filter((active) => active.type !== effect.type);
    this.activeEffects.push({ ...effect });
  }

  abstract buildAnimator(): Animator;

  private updateStatusEffects(dt: number): void {
    if (this.activeEffects.length === 0) return;
    this.statusTimerMs += dt;
    const turnTicks = Math.floor(this.statusTimerMs / 1000);
    if (turnTicks <= 0) return;
    this.statusTimerMs -= turnTicks * 1000;
    for (const effect of this.activeEffects) {
      effect.turnsRemaining = Math.max(0, effect.turnsRemaining - turnTicks);
    }
    this.activeEffects = this.activeEffects.filter((effect) => effect.turnsRemaining > 0);
  }

  private drawSprite(ctx: CanvasRenderingContext2D, assets: SpriteAssets, x: number, y: number): void {
    const frameIndex = this.animator.currentFrame.x;
    // Cadeia de fallback: chave específica → padrão genérico de monstro
    // (`necromancer_anim_fN`) → idle f0 → base estática.
    const frame =
      assets.getFrame(this.currentFrameKey()) ??
      assets.getFrame(`${this.spriteKey}_anim_f${frameIndex}`) ??
      assets.getFrame(`${this.spriteKey}_idle_anim_f0`) ??
      assets.getFrame(this.spriteKey);
    if (!frame) return;

    const scale = RENDER_TILE / 16;
    const width = frame.width * scale;
    const height = frame.height * scale;
    const dx = x + (RENDER_TILE - width) / 2;
    const dy = y + RENDER_TILE - height;

    ctx.drawImage(frame, dx, dy, width, height);
    if (this.hitFlashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.8, this.hitFlashTimer / 120);
      ctx.filter = 'brightness(4) grayscale(1)';
      ctx.drawImage(frame, dx, dy, width, height);
      ctx.restore();
    }
  }

  private currentFrameKey(): string {
    const animation = this.animator.currentName ?? 'idle';
    const frame = this.animator.currentFrame;
    const assetAnimation =
      animation === 'walk' ? 'run' : animation === 'hurt' ? 'hit' : animation === 'death' ? 'idle' : animation;
    if (!this.spriteKey) return '';
    return `${this.spriteKey}_${assetAnimation}_anim_f${frame.x}`;
  }
}
