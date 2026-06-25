import { Animator } from '@/entities/Animator';
import { Entity, normalizeStats } from '@/entities/Entity';
import type { MinionSave } from '@/types';

/**
 * Aliado invocado pelo jogador (ex.: esqueleto do necromante). Age sozinho na
 * ordem de turnos atacando inimigos e **persiste entre combates** enquanto
 * estiver vivo — só some quando seu HP zera.
 */
export class Minion extends Entity {
  readonly name: string;
  anim: 'idle' | 'run' = 'idle';
  facingLeft = false;

  constructor(name: string, sprite: string, maxHp: number, attack: number, hp = maxHp) {
    super(0, 0, 'm', '#cfd2dd', false, sprite);
    this.name = name;
    this.stats = normalizeStats({ hp, maxHp, attack, atk: attack, speed: 10, spd: 10 });
    this.animator = this.buildAnimator();
    this.animator.play('idle', true);
  }

  override buildAnimator(): Animator {
    return new Animator()
      .add({ name: 'idle', frames: frames(4), frameTime: 160, loop: true })
      .add({ name: 'walk', frames: frames(4), frameTime: 90, loop: true })
      .add({ name: 'attack', frames: frames(4), frameTime: 90, loop: false })
      .add({ name: 'hurt', frames: [{ x: 0, y: 0 }], frameTime: 120, loop: false })
      .add({ name: 'death', frames: [{ x: 0, y: 0 }], frameTime: 240, loop: false });
  }

  override isAlive(): boolean {
    return this.stats.hp > 0;
  }

  toSave(): MinionSave {
    return {
      name: this.name,
      sprite: this.spriteKey,
      hp: this.stats.hp,
      maxHp: this.stats.maxHp,
      attack: this.stats.attack,
    };
  }

  static fromSave(save: MinionSave): Minion {
    return new Minion(save.name, save.sprite, save.maxHp, save.attack, save.hp);
  }
}

function frames(count: number) {
  return Array.from({ length: count }, (_, x) => ({ x, y: 0 }));
}
