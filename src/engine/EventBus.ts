import type { GameEvents } from '@/types';

type EventKey = keyof GameEvents;
type Handler<K extends EventKey> = (payload: GameEvents[K]) => void;

/**
 * Barramento publish/subscribe tipado. A instancia exportada abaixo e o
 * singleton compartilhado entre os subsistemas do jogo.
 */
export class TypedEventBus {
  private readonly handlers = new Map<EventKey, Set<Handler<EventKey>>>();

  /** Inscreve um handler e retorna a funcao de unsubscribe. */
  on<K extends EventKey>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<EventKey>);
    return () => {
      this.handlers.get(event)?.delete(handler as Handler<EventKey>);
    };
  }

  /** Emite um evento para todos os assinantes atuais. */
  emit<K extends EventKey>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as Handler<K>)(payload);
    }
  }

  /** Remove todos os handlers registrados. */
  clear(): void {
    this.handlers.clear();
  }
}

export type EventBus = TypedEventBus;
export const EventBus = new TypedEventBus();
