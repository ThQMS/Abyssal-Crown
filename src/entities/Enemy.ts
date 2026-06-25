import { Animator } from '@/entities/Animator';
import { Entity, normalizeStats } from '@/entities/Entity';
import type { Affinities, EnemyDefinition } from '@/types';

/**
 * A hostile creature instantiated from an {@link EnemyDefinition}. The
 * {@link EnemyAI} reads `behavior` to decide actions during combat.
 */
export class Enemy extends Entity {
  readonly defId: string;
  readonly name: string;
  /** Chave do tile de spawn (`"x,y"`), identidade estável entre regenerações. */
  readonly spawnKey: string;
  /** Current animation state, read by the renderer. */
  anim: 'idle' | 'run' = 'idle';
  facingLeft = false;
  affinities: Affinities;
  readonly skills: string[];
  readonly behavior: string;
  readonly xpReward: number;
  readonly loot: string[];

  constructor(x: number, y: number, def: EnemyDefinition) {
    super(x, y, def.glyph, def.color, true, def.sprite);
    this.defId = def.id;
    this.name = def.name;
    this.spawnKey = `${x},${y}`;
    this.stats = normalizeStats(def.stats);
    this.affinities = { ...def.affinities };
    this.skills = [...def.skills];
    this.behavior = def.behavior;
    this.xpReward = def.xpReward;
    this.loot = def.loot ? [...def.loot] : [];
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

}

function frames(count: number) {
  return Array.from({ length: count }, (_, x) => ({ x, y: 0 }));
}
