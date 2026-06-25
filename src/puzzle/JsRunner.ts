import { executeJs, fail } from '@/puzzle/jsSandbox';
import type { RunnerTestCase, RunResult } from '@/puzzle/jsSandbox';

// Reexporta a API compartilhada para os consumidores existentes
// (PyodideRunner, ArcaneTerminal) sem mudar os imports deles.
export { deepEqual, argsOf } from '@/puzzle/jsSandbox';
export type { RunnerTestCase, RunResult, TestOutcome } from '@/puzzle/jsSandbox';

/** Tempo máximo (ms) para a execução do código do jogador antes de abortar. */
const TIMEOUT_MS = 2000;

/**
 * Executor de JavaScript dos puzzles. A execução acontece num **Web Worker**:
 * assim, um laço infinito no código do jogador trava apenas o worker (não a
 * aba), e a thread principal o mata via `worker.terminate()` ao estourar o
 * timeout — um timeout *real*, diferente da antiga corrida com `Promise`.
 *
 * Se Workers não estiverem disponíveis (ambiente sem DOM, navegador antigo),
 * cai para a execução síncrona em {@link executeJs} (sem proteção de loop).
 */
export class JsRunner {
  static run(
    code: string,
    testCases: RunnerTestCase[],
    functionName = 'solution',
    timeoutMs = TIMEOUT_MS,
  ): Promise<RunResult> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(executeJs(code, testCases, functionName));
    }

    return new Promise<RunResult>((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./jsRunner.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        // Falha ao criar o worker: usa o caminho síncrono como último recurso.
        resolve(executeJs(code, testCases, functionName));
        return;
      }

      let settled = false;
      const finish = (result: RunResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(
          fail(
            testCases,
            `Tempo limite (${timeoutMs / 1000}s) excedido — possível laço infinito. Execução abortada.`,
          ),
        );
      }, timeoutMs);

      worker.onmessage = (event: MessageEvent<RunResult>) => finish(event.data);
      worker.onerror = (event) => finish(fail(testCases, event.message || 'Erro no worker de execução.'));
      worker.postMessage({ code, testCases, functionName });
    });
  }
}
