import { describe, it, expect } from 'vitest';
import puzzles from '@/data/puzzles.json';

interface PuzzleLike {
  id: string;
  floor: number;
  title: string;
  type: string;
  starterCode: string;
  testCases: { input: unknown; expected: unknown }[];
  reward: { xp: number };
  required: boolean;
}

// Sob o Vitest o .json pode chegar como texto cru; sob o Vite (app) como array.
const raw = puzzles as unknown;
const data = (
  typeof raw === 'string'
    ? JSON.parse(raw)
    : Array.isArray(raw)
      ? raw
      : (raw as { default: unknown[] }).default
) as PuzzleLike[];

describe('puzzles.json (integridade do conteúdo)', () => {
  it('tem 40 puzzles', () => {
    expect(data.length).toBe(40);
  });

  it('ids são únicos', () => {
    expect(new Set(data.map((p) => p.id)).size).toBe(data.length);
  });

  it('cada puzzle de código define a função solution e tem casos de teste', () => {
    for (const p of data.filter((p) => p.type === 'code')) {
      expect(p.starterCode, `${p.id}: starterCode deve conter "solution"`).toContain('solution');
      expect(p.testCases.length, `${p.id}: precisa de casos de teste`).toBeGreaterThan(0);
      for (const tc of p.testCases) {
        expect(Array.isArray(tc.input), `${p.id}: input deve ser a lista de argumentos`).toBe(true);
      }
    }
  });

  it('cada andar de 1 a 10 tem ao menos um puzzle obrigatório', () => {
    for (let floor = 1; floor <= 10; floor++) {
      const required = data.filter((p) => p.floor === floor && p.required);
      expect(required.length, `andar ${floor} sem puzzle obrigatório`).toBeGreaterThan(0);
    }
  });

  it('toda recompensa tem XP positivo', () => {
    for (const p of data) expect(p.reward.xp).toBeGreaterThan(0);
  });
});
