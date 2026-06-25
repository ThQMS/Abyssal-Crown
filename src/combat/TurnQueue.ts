import type { Entity } from '@/entities/Entity';
import type { RNG } from '@/utils/RNG';

/** Fila circular simples de turnos, ordenada por velocidade no build. */
export class TurnQueue<T extends Entity = Entity> {
  private queue: T[] = [];

  constructor(combatants: T[] = []) {
    if (combatants.length > 0) this.build(combatants);
  }

  build(combatants: T[], rng?: RNG): void {
    this.queue = combatants
      .filter((combatant) => combatant.isAlive())
      .sort((a, b) => {
        const speedDiff = speedOf(b) - speedOf(a);
        if (speedDiff !== 0) return speedDiff;
        return (rng ? rng.next() : Math.random()) - 0.5;
      });
  }

  next(): T | null {
    while (this.queue.length > 0) {
      const entity = this.queue.shift() ?? null;
      if (!entity) return null;
      if (!entity.isAlive()) continue;
      this.queue.push(entity);
      return entity;
    }
    return null;
  }

  /** Insere um combatente já em andamento (ex.: aliado invocado). Age ao fim da volta. */
  add(entity: T): void {
    if (entity.isAlive() && !this.queue.includes(entity)) this.queue.push(entity);
  }

  remove(entity: T): void {
    this.queue = this.queue.filter((queued) => queued !== entity && queued.id !== entity.id);
  }

  isEmpty(): boolean {
    return this.queue.length === 0 || this.queue.every((entity) => !entity.isAlive());
  }

  getOrder(): T[] {
    return this.queue.filter((entity) => entity.isAlive());
  }
}

function speedOf(entity: Entity): number {
  return entity.stats.spd ?? entity.stats.speed ?? 0;
}
