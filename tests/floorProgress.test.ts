import { describe, it, expect } from 'vitest';
import { DungeonLevel } from '@/world/DungeonLevel';
import puzzlesData from '@/data/puzzles.json';

const PUZZLE_FLOOR = new Map(
  (puzzlesData as { id: string; floor: number }[]).map((p) => [p.id, p.floor]),
);

/**
 * O layout é determinístico por andar, então duas instâncias do mesmo andar têm
 * os mesmos inimigos/baús. Isso permite salvar o progresso de uma e restaurá-lo
 * noutra (o que "Continuar" faz ao regenerar o andar).
 */
describe('persistência de progresso do andar', () => {
  it('regenera inimigos idênticos (mesma chave de spawn)', () => {
    const a = new DungeonLevel(2);
    const b = new DungeonLevel(2);
    expect(a.enemies.map((e) => e.spawnKey)).toEqual(b.enemies.map((e) => e.spawnKey));
  });

  it('restaura inimigos derrotados, baús abertos e névoa', () => {
    const source = new DungeonLevel(2);
    expect(source.enemies.length).toBeGreaterThan(0);

    // Derrota o primeiro inimigo e abre o primeiro baú (se houver).
    const killedKey = source.enemies[0]!.spawnKey;
    source.enemies[0]!.dead = true;
    source.enemies[0]!.stats.hp = 0;
    source.removeDeadEnemies();
    const chest = source.chests[0];
    if (chest) chest.open();
    // Revela um pedaço do mapa.
    source.revealAround(source.entrance, 6);

    const progress = source.serializeProgress();
    expect(progress.livingEnemies).not.toContain(killedKey);

    // Andar fresco recebe o progresso.
    const restored = new DungeonLevel(2);
    const before = restored.enemies.length;
    restored.restoreProgress(progress);

    // O inimigo derrotado não reaparece.
    expect(restored.enemies.length).toBe(before - 1);
    expect(restored.enemies.some((e) => e.spawnKey === killedKey)).toBe(false);
    // O baú aberto continua aberto.
    if (chest) expect(restored.chests[0]!.opened).toBe(true);
    // A névoa descoberta foi restaurada (entrada visível).
    expect(restored.fog.isDiscovered(source.entrance.x, source.entrance.y)).toBe(true);
  });
});

describe('seleção de puzzle por andar', () => {
  it('sorteia um puzzle do próprio andar (dificuldade correta)', () => {
    for (const floor of [1, 3, 5, 7, 9]) {
      const level = new DungeonLevel(floor);
      const id = level.requiredPuzzleId;
      if (!id) continue; // andar sem sala de puzzle nesta geração
      expect(PUZZLE_FLOOR.get(id), `andar ${floor} pegou puzzle de outro andar`).toBe(floor);
    }
  });
});
