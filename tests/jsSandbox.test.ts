import { describe, it, expect } from 'vitest';
import { executeJs, argsOf, deepEqual } from '@/puzzle/jsSandbox';

describe('executeJs (núcleo do runner JS)', () => {
  it('aprova uma solução correta em todos os testes', () => {
    const code = 'function solution(a, b) { return a + b; }';
    const r = executeJs(code, [
      { input: [2, 3], expected: 5 },
      { input: [-4, 4], expected: 0 },
    ]);
    expect(r.success).toBe(true);
    expect(r.passed).toBe(2);
  });

  it('marca falhas quando a saída diverge', () => {
    const code = 'function solution(n) { return n * 2; }';
    const r = executeJs(code, [{ input: [3], expected: 6 }, { input: [3], expected: 7 }]);
    expect(r.success).toBe(false);
    expect(r.passed).toBe(1);
    expect(r.outcomes[1]?.passed).toBe(false);
  });

  it('reporta erro global quando não há função solution', () => {
    const r = executeJs('const x = 1;', [{ input: [1], expected: 1 }]);
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('aceita o nome de função alternativo solve', () => {
    const r = executeJs('function solve(s){return s.length;}', [{ input: ['abc'], expected: 3 }]);
    expect(r.success).toBe(true);
  });

  it('captura exceções do código do jogador por caso de teste', () => {
    const r = executeJs('function solution(){ throw new Error("boom"); }', [{ input: [], expected: 1 }]);
    expect(r.success).toBe(false);
    expect(r.outcomes[0]?.error).toContain('boom');
  });

  it('globais perigosos ficam indefinidos no sandbox', () => {
    const code = 'function solution() { return typeof fetch + "," + typeof localStorage; }';
    const r = executeJs(code, [{ input: [], expected: 'undefined,undefined' }]);
    expect(r.success).toBe(true);
  });
});

describe('argsOf', () => {
  it('input array vira lista de argumentos espalhada', () => {
    expect(argsOf({ input: [[1, 2, 3]], expected: 0 })).toEqual([[1, 2, 3]]);
    expect(argsOf({ input: [2, 3], expected: 0 })).toEqual([2, 3]);
  });
  it('args tem prioridade sobre input', () => {
    expect(argsOf({ args: [9], input: [1, 2], expected: 0 })).toEqual([9]);
  });
});

describe('deepEqual', () => {
  it('compara estruturas por valor', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
});
