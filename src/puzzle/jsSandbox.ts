/**
 * Núcleo puro e síncrono que executa o JavaScript do jogador contra os casos de
 * teste. É compartilhado pela thread principal ({@link JsRunner} como fallback)
 * e pelo Web Worker (`jsRunner.worker.ts`), por isso NÃO referencia o worker —
 * evita ciclo de importação.
 *
 * O código roda num `new Function` com globais perigosos sombreados. Isto é uma
 * conveniência, não uma fronteira de segurança: o jogador só executa o próprio
 * código, localmente. O timeout real (matar laço infinito) é responsabilidade do
 * Worker, que pode ser terminado de fora.
 */

/** Caso de teste aceito pelos runners. */
export interface RunnerTestCase {
  /** Argumento único passado a `solution(input)`. */
  input?: unknown;
  /** Lista de argumentos espalhada como `solution(...args)`. Tem prioridade. */
  args?: unknown[];
  expected: unknown;
  description?: string;
}

/** Resultado de um único caso de teste. */
export interface TestOutcome {
  index: number;
  description: string;
  passed: boolean;
  expected: unknown;
  actual?: unknown;
  error?: string;
}

/** Resultado consolidado de uma execução contra todos os casos de teste. */
export interface RunResult {
  /** Verdadeiro somente se todos os testes passaram. */
  success: boolean;
  passed: number;
  total: number;
  outcomes: TestOutcome[];
  /** Erro global (ex.: `solution` não definida, ou timeout) que impede a execução. */
  error?: string;
}

/** Nomes de função aceitos como ponto de entrada, em ordem de preferência. */
const ENTRY_NAMES = ['solution', 'solve'];

/** Globais perigosos sombreados dentro do sandbox. */
const BLOCKED_GLOBALS = [
  'window',
  'document',
  'fetch',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'globalThis',
  'self',
  'indexedDB',
];

/**
 * Executa `code` contra `testCases` de forma SÍNCRONA. Valida que a função de
 * entrada existe antes de chamar. Não impõe timeout — quem chama (Worker) é que
 * limita o tempo.
 */
export function executeJs(
  code: string,
  testCases: RunnerTestCase[],
  functionName = 'solution',
): RunResult {
  let solution: ((...args: unknown[]) => unknown) | undefined;
  try {
    solution = compile(code, functionName);
  } catch (err) {
    return fail(testCases, err instanceof Error ? err.message : String(err));
  }

  if (typeof solution !== 'function') {
    return fail(testCases, `Nenhuma função "${functionName}" (ou "solution") foi definida.`);
  }

  const fn = solution;
  const outcomes: TestOutcome[] = [];
  let passed = 0;
  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i] as RunnerTestCase;
    const args = argsOf(test);
    try {
      const actual = fn(...args);
      const ok = deepEqual(actual, test.expected);
      if (ok) passed++;
      outcomes.push({ index: i, description: test.description ?? '', passed: ok, expected: test.expected, actual });
    } catch (err) {
      outcomes.push({
        index: i,
        description: test.description ?? '',
        passed: false,
        expected: test.expected,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { success: passed === testCases.length, passed, total: testCases.length, outcomes };
}

/** Compila `code` e devolve a função de entrada (ou undefined). */
function compile(code: string, functionName: string): ((...args: unknown[]) => unknown) | undefined {
  const lookup = [functionName, ...ENTRY_NAMES.filter((n) => n !== functionName)];
  const picker =
    lookup.map((name) => `(typeof ${name}==='function'?${name}:`).join('') +
    'undefined' +
    ')'.repeat(lookup.length);

  const factory = new Function(...BLOCKED_GLOBALS, `"use strict";\n${code}\n;return ${picker};`);
  return factory(...BLOCKED_GLOBALS.map(() => undefined)) as
    | ((...args: unknown[]) => unknown)
    | undefined;
}

/**
 * Resolve a lista de argumentos de um caso de teste. `args` tem prioridade; do
 * contrário `input` é tratado como a lista de argumentos (espalhada). Assim,
 * `input: [[1,2,3]]` chama `solution([1,2,3])`, e `input: [a, b]` chama
 * `solution(a, b)`.
 */
export function argsOf(test: RunnerTestCase): unknown[] {
  if (Array.isArray(test.args)) return test.args;
  if (Array.isArray(test.input)) return test.input;
  if (test.input !== undefined) return [test.input];
  return [];
}

/** Igualdade estrutural por comparação de JSON (suficiente p/ respostas de puzzle). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Constrói um RunResult de falha global (todos os testes marcados como erro). */
export function fail(testCases: RunnerTestCase[], error: string): RunResult {
  return {
    success: false,
    passed: 0,
    total: testCases.length,
    outcomes: testCases.map((t, i) => ({
      index: i,
      description: t.description ?? '',
      passed: false,
      expected: t.expected,
      error,
    })),
    error,
  };
}
