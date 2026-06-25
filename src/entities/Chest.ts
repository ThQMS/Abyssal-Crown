import { Animator } from '@/entities/Animator';
import { Entity } from '@/entities/Entity';

/**
 * Bau saqueavel. Pode estar travado por puzzle: nesse caso, abrir exige que o
 * `puzzleId` correspondente ja tenha sido resolvido.
 */
export class Chest extends Entity {
  readonly contents: string[];
  readonly puzzleId?: string;
  opened = false;
  readonly spriteClosed = 'chest_full_open_anim_f0';
  readonly spriteOpen = 'chest_empty_open_anim_f2';

  constructor(x: number, y: number, contents: string[], puzzleId?: string) {
    super(x, y, '#', '#c8a44a', true, 'chest_full_open_anim_f0');
    this.contents = contents;
    this.puzzleId = puzzleId;
    this.animator = this.buildAnimator();
    this.animator.play('idle', true);
  }

  override buildAnimator(): Animator {
    return new Animator().add({ name: 'idle', frames: [{ x: 0, y: 0 }], frameTime: 1000, loop: true });
  }

  override get sprite(): string {
    return this.opened ? this.spriteOpen : this.spriteClosed;
  }

  get locked(): boolean {
    return this.puzzleId !== undefined && !this.opened;
  }

  open(): string[] {
    if (this.opened) return [];
    this.markOpened();
    return [...this.contents];
  }

  /** Marca como aberto (visual) sem conceder loot — usado ao restaurar um save. */
  markOpened(): void {
    this.opened = true;
    this.spriteKey = this.spriteOpen;
    this.glyph = '.';
    this.color = '#7a6a3a';
  }
}
