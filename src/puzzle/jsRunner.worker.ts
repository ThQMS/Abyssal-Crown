import { executeJs, type RunnerTestCase, type RunResult } from '@/puzzle/jsSandbox';

/** Mensagem enviada pela thread principal ao worker. */
interface RunMessage {
  code: string;
  testCases: RunnerTestCase[];
  functionName: string;
}

/**
 * Worker que executa o JavaScript do jogador. Roda numa thread separada, então
 * um laço infinito trava ESTE worker — não a aba — e a thread principal pode
 * matá-lo com `worker.terminate()` ao estourar o timeout.
 */
self.onmessage = (event: MessageEvent<RunMessage>) => {
  const { code, testCases, functionName } = event.data;
  const result: RunResult = executeJs(code, testCases, functionName);
  (self as unknown as Worker).postMessage(result);
};
