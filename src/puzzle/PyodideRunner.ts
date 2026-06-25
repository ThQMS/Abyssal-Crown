import { deepEqual, argsOf } from '@/puzzle/JsRunner';
import type { RunnerTestCase, RunResult, TestOutcome } from '@/puzzle/JsRunner';

/** Forma minima do runtime Pyodide que consumimos. */
interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>;
  globals: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
}

declare global {
  // Fornecido pelo bundle Pyodide do CDN quando carregado.
  interface Window {
    loadPyodide?: (config?: { indexURL?: string }) => Promise<PyodideLike>;
  }
}

const PYODIDE_VERSION = 'v0.27.0';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

/** Nomes de funcao aceitos como ponto de entrada, em ordem de preferencia. */
const ENTRY_NAMES = ['solution', 'solve'];

/**
 * Carrega o Pyodide (Python em WASM) sob demanda para os puzzles em Python. O
 * runtime e pesado (~10 MB), por isso so e baixado na primeira execucao Python.
 * Se o CDN estiver inacessivel (offline ou CSP estrito), `run` devolve um erro
 * e o jogo segue oferecendo apenas puzzles em JS.
 */
export class PyodideRunner {
  private static instance?: PyodideLike;
  private static loading?: Promise<PyodideLike | undefined>;

  /** Verdadeiro quando o runtime ja terminou de inicializar. */
  static get isReady(): boolean {
    return this.instance !== undefined;
  }

  /** Inicia (ou aguarda) a carga do Pyodide. Seguro chamar repetidamente. */
  static async init(): Promise<PyodideLike | undefined> {
    if (this.instance) return this.instance;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        if (!window.loadPyodide) {
          await injectScript(`${PYODIDE_CDN}pyodide.js`);
        }
        if (!window.loadPyodide) return undefined;
        this.instance = await window.loadPyodide({ indexURL: PYODIDE_CDN });
        return this.instance;
      } catch {
        return undefined;
      }
    })();

    return this.loading;
  }

  /**
   * Executa `code` em Python e o avalia contra `testCases`. Valida que a funcao
   * de entrada existe antes de chamar. Resultados sao convertidos para JS via
   * `.toJs()` quando disponivel.
   */
  static async run(
    code: string,
    testCases: RunnerTestCase[],
    functionName = 'solution',
  ): Promise<RunResult> {
    const py = await this.init();
    if (!py) {
      return globalFail(testCases, 'Runtime Python indisponivel (offline ou bloqueado).');
    }

    // Define as funcoes do jogador uma unica vez.
    try {
      await py.runPythonAsync(code);
    } catch (err) {
      return globalFail(testCases, err instanceof Error ? err.message : String(err));
    }

    // Valida o ponto de entrada.
    const entry = [functionName, ...ENTRY_NAMES.filter((n) => n !== functionName)].find(
      (name) => typeof py.globals.get(name) !== 'undefined' && py.globals.get(name) !== null,
    );
    if (!entry) {
      return globalFail(testCases, `Nenhuma funcao "${functionName}" (ou "solution") foi definida.`);
    }

    const outcomes: TestOutcome[] = [];
    let passed = 0;
    for (let i = 0; i < testCases.length; i++) {
      const test = testCases[i] as RunnerTestCase;
      try {
        const args = argsOf(test);
        // Passa os argumentos pelo escopo global para evitar serializacao manual.
        py.globals.set('__ac_args', args);
        const raw = await py.runPythonAsync(`${entry}(*__ac_args)`);
        const actual = toJs(raw);
        const ok = deepEqual(actual, test.expected);
        if (ok) passed++;
        outcomes.push({
          index: i,
          description: test.description ?? '',
          passed: ok,
          expected: test.expected,
          actual,
        });
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
}

/** Converte um valor vindo do Python para JS, usando `.toJs()` quando existir. */
function toJs(value: unknown): unknown {
  if (value && typeof (value as { toJs?: () => unknown }).toJs === 'function') {
    const js = (value as { toJs: () => unknown }).toJs();
    // Alguns objetos Pyodide expoem destroy(); liberamos a referencia WASM.
    const destroyable = value as { destroy?: () => void };
    if (typeof destroyable.destroy === 'function') destroyable.destroy();
    return js;
  }
  return value;
}

/** Injeta uma tag `<script>` e resolve quando ela carrega. */
function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(tag);
  });
}

/** RunResult de falha global (todos os testes marcados como erro). */
function globalFail(testCases: RunnerTestCase[], error: string): RunResult {
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
