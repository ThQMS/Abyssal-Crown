import type { PuzzleData, PuzzleReward, PuzzleResult } from '@/types';
import type { EventBus } from '@/engine/EventBus';

/**
 * Catalogo de puzzles (modelo {@link PuzzleData}). Indexa as definicoes por id,
 * registra quais foram resolvidos (espelhado no save) e expoe as recompensas.
 *
 * A execucao/validacao em si acontece no {@link ArcaneTerminal} (via os runners
 * JS/Python); este sistema apenas guarda os dados e o estado de progresso.
 */
export class PuzzleSystem {
  private readonly definitions = new Map<string, PuzzleData>();
  private readonly solved = new Set<string>();
  private readonly bus?: EventBus;

  constructor(definitions: PuzzleData[], bus?: EventBus) {
    for (const def of definitions) this.definitions.set(def.id, def);
    this.bus = bus;
  }

  /** Restaura o estado de resolucao a partir de um save. */
  hydrate(solvedIds: string[]): void {
    for (const id of solvedIds) this.solved.add(id);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  isSolved(id: string): boolean {
    return this.solved.has(id);
  }

  /** Definicao completa de um puzzle (consumida pela visao do terminal). */
  getData(id: string): PuzzleData | undefined {
    return this.definitions.get(id);
  }

  /** Todas as definicoes, em ordem de insercao. */
  all(): PuzzleData[] {
    return [...this.definitions.values()];
  }

  /** Puzzles de um andar especifico. */
  forFloor(floor: number): PuzzleData[] {
    return this.all().filter((p) => p.floor === floor);
  }

  /** Recompensa associada a um puzzle. */
  reward(id: string): PuzzleReward | undefined {
    return this.definitions.get(id)?.reward;
  }

  /** Registra um acerto (vindo do terminal) e emite `puzzle:solved` uma vez. */
  markSolved(id: string, result: PuzzleResult): void {
    if (this.solved.has(id)) return;
    this.solved.add(id);
    this.bus?.emit('puzzle:solved', { puzzleId: id, result });
  }

  /** Ids dos puzzles resolvidos, para persistencia. */
  serialize(): string[] {
    return [...this.solved];
  }
}
