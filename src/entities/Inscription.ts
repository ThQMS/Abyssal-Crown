import { Animator } from '@/entities/Animator';
import { Entity } from '@/entities/Entity';
import type { LoreEntry } from '@/types';

/**
 * Inscricao de parede que entrega lore e, opcionalmente, abre um puzzle.
 */
export class Inscription extends Entity {
  readonly lore: LoreEntry;
  readonly puzzleId?: string;
  read = false;

  constructor(x: number, y: number, lore: LoreEntry, puzzleId?: string) {
    super(x, y, '?', '#8a7acd', false, puzzleId ? 'wall_banner_red' : 'wall_banner_blue');
    this.lore = lore;
    this.puzzleId = puzzleId;
    this.animator = this.buildAnimator();
    this.animator.play('idle', true);
  }

  override buildAnimator(): Animator {
    return new Animator().add({ name: 'idle', frames: [{ x: 0, y: 0 }], frameTime: 1000, loop: true });
  }

  get hasPuzzle(): boolean {
    return this.puzzleId !== undefined;
  }

  override get sprite(): string {
    return this.hasPuzzle ? 'wall_banner_red' : 'wall_banner_blue';
  }
}
