import { JsRunner } from '@/puzzle/JsRunner';
import { PyodideRunner } from '@/puzzle/PyodideRunner';
import { EventBus } from '@/engine/EventBus';
import type { RunnerTestCase, RunResult } from '@/puzzle/JsRunner';
import type { PuzzleResult } from '@/types';

/** Linguagem de um puzzle de codigo (ou `both` para deixar o jogador escolher). */
export type TerminalLanguage = 'js' | 'python' | 'both' | 'none';

/** Dados que o terminal precisa para apresentar e validar um puzzle. */
export interface TerminalPuzzle {
  id: string;
  title: string;
  /** Andar atual, exibido no cabecalho. */
  floor: number;
  language: TerminalLanguage;
  /** Texto de ambientacao, em italico roxo claro. */
  lore: string;
  /** Enunciado do problema, em branco. */
  description: string;
  starterCode: string;
  hint: string;
  /** Nome da funcao de entrada (default `solution`). */
  functionName?: string;
  /** Casos de teste para puzzles de codigo. */
  testCases: RunnerTestCase[];
  /** Validador alternativo p/ puzzles que nao sao de codigo (logica/cifra/padrao). */
  check?: (answer: string) => Promise<PuzzleResult> | PuzzleResult;
  /** Tentativas permitidas antes da penalidade (default 3). */
  maxAttempts?: number;
}

const DEFAULT_ATTEMPTS = 3;
/** Penalidades de HP devolvidas no PuzzleResult (o estado de jogo as aplica). */
const PENALTY_FAIL = 20;
const PENALTY_ABANDON = 30;

/**
 * Overlay HTML criado dinamicamente sobre o canvas. Estetica de terminal arcano:
 * fundo quase opaco, borda roxa, texto verde fosforico em Courier New. Todo o
 * texto e em PT-BR.
 *
 * `show(puzzle)` exibe o terminal e resolve com um {@link PuzzleResult} quando o
 * jogador vence, esgota as tentativas ou abandona.
 */
export class ArcaneTerminal {
  private readonly root: HTMLElement;
  private readonly header: HTMLElement;
  private readonly loreEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private readonly langBar: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly output: HTMLElement;
  private readonly attemptsEl: HTMLElement;
  private readonly hintBtn: HTMLButtonElement;
  private readonly abandonBtn: HTMLButtonElement;
  private readonly invokeBtn: HTMLButtonElement;

  private puzzle?: TerminalPuzzle;
  private resolve?: (result: PuzzleResult) => void;
  private attemptsLeft = DEFAULT_ATTEMPTS;
  private attemptsUsed = 0;
  private activeLang: 'js' | 'python' = 'js';
  /** Código por linguagem, preservado ao alternar as abas (puzzles `both`). */
  private codeByLang: { js: string; python: string } = { js: '', python: '' };
  private startMs = 0;
  private busy = false;

  constructor(mount: HTMLElement = document.body) {
    this.root = el('div', ROOT_STYLE);
    this.root.hidden = true;

    this.header = el('div', HEADER_STYLE);
    this.loreEl = el('p', LORE_STYLE);
    this.descEl = el('p', DESC_STYLE);
    this.langBar = el('div', LANGBAR_STYLE);

    this.input = document.createElement('textarea');
    this.input.spellcheck = false;
    this.input.style.cssText = INPUT_STYLE;
    this.input.addEventListener('keydown', this.handleKeyDown);

    this.output = el('pre', OUTPUT_STYLE);

    const footer = el('div', FOOTER_STYLE);
    this.attemptsEl = el('span', ATTEMPTS_STYLE);
    const buttons = el('div', 'display:flex;gap:8px;');
    this.hintBtn = button('Dica', '#3a3357');
    this.abandonBtn = button('Abandonar', '#5a2a3a');
    this.invokeBtn = button('EXECUTAR', '#4a3f6b');
    buttons.append(this.hintBtn, this.abandonBtn, this.invokeBtn);
    footer.append(this.attemptsEl, buttons);

    this.hintBtn.addEventListener('click', () => this.showHint());
    this.abandonBtn.addEventListener('click', () => this.abandon());
    this.invokeBtn.addEventListener('click', () => void this.invoke());

    this.root.append(this.header, this.loreEl, this.descEl, this.langBar, this.input, this.output, footer);
    mount.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Exibe o terminal para um puzzle e resolve quando ele termina. */
  show(puzzle: TerminalPuzzle): Promise<PuzzleResult> {
    this.puzzle = puzzle;
    this.attemptsLeft = puzzle.maxAttempts ?? DEFAULT_ATTEMPTS;
    this.attemptsUsed = 0;
    this.activeLang = puzzle.language === 'python' ? 'python' : 'js';
    this.startMs = performance.now();
    this.busy = false;

    // O starter dos dados é em JS; deriva um esqueleto Python equivalente para
    // a aba Python não herdar `function ... {` (erro de sintaxe em Python).
    this.codeByLang = {
      js: puzzle.starterCode,
      python: pythonStarterFrom(puzzle.starterCode),
    };
    this.loreEl.textContent = puzzle.lore;
    this.loreEl.style.display = puzzle.lore ? 'block' : 'none';
    this.descEl.textContent = puzzle.description;
    this.input.value = this.codeByLang[this.activeLang];
    this.input.readOnly = false;
    this.updateHeader();
    this.output.textContent = '';
    this.invokeBtn.textContent = 'EXECUTAR';
    this.renderLanguageSelector(puzzle.language);
    this.renderAttempts();

    this.root.hidden = false;
    this.playEntrance();
    this.input.focus();

    return new Promise<PuzzleResult>((resolve) => {
      this.resolve = resolve;
    });
  }

  // --- Acoes ----------------------------------------------------------------

  /** Executa o ritual: roda o codigo (ou valida a resposta) e mostra o resultado. */
  private async invoke(): Promise<void> {
    if (!this.puzzle || this.busy) return;
    this.busy = true;
    this.output.style.color = TEXT_GREEN;
    this.output.textContent = 'Executando ritual arcano...';

    try {
      const solved = this.puzzle.check
        ? await this.runCheck(this.puzzle.check)
        : await this.runCode();

      if (solved) {
        this.finishSolved();
        return;
      }

      this.attemptsUsed++;
      this.attemptsLeft--;
      this.renderAttempts();

      if (this.attemptsLeft <= 0) {
        this.finishExhausted();
      }
    } finally {
      this.busy = false;
    }
  }

  /** Roda os casos de teste com o runner adequado e imprime teste a teste. */
  private async runCode(): Promise<boolean> {
    const puzzle = this.puzzle as TerminalPuzzle;
    // Detecta a linguagem pelo código (e remove um starter vazio da outra),
    // para o caso comum de escrever Python na aba JS ou vice-versa.
    const { lang, code } = resolveRun(this.input.value, this.activeLang);
    if (lang !== this.activeLang) {
      this.activeLang = lang;
      this.renderLanguageSelector(puzzle.language);
      this.updateHeader();
    }
    const runner = lang === 'python' ? PyodideRunner : JsRunner;
    const result: RunResult = await runner.run(code, puzzle.testCases, puzzle.functionName);
    this.renderRunResult(result);
    return result.success;
  }

  /** Valida puzzles que nao sao de codigo via callback de verificacao. */
  private async runCheck(check: NonNullable<TerminalPuzzle['check']>): Promise<boolean> {
    const result = await check(this.input.value);
    this.output.style.color = result.solved ? TEXT_GREEN : TEXT_RED;
    const lines = [result.solved ? `✓ ${result.message}` : `✗ ${result.message}`];
    if (result.details?.length) lines.push('', ...result.details);
    this.output.textContent = lines.join('\n');
    return result.solved;
  }

  /** Mostra o resultado dos testes, um por linha. */
  private renderRunResult(result: RunResult): void {
    const lines: string[] = [];
    if (result.error) lines.push(`⚠ ${result.error}`, '');

    result.outcomes.forEach((o, i) => {
      const label = o.description ? `Teste ${i + 1} (${o.description})` : `Teste ${i + 1}`;
      if (o.passed) {
        lines.push(`${label}: ✓`);
      } else if (o.error) {
        lines.push(`${label}: erro — ${o.error}`);
      } else {
        lines.push(`${label}: esperado ${fmt(o.expected)}, obtido ${fmt(o.actual)}`);
      }
    });

    lines.push('', `${result.passed}/${result.total} testes passaram.`);
    this.output.style.color = result.success ? TEXT_GREEN : TEXT_RED;
    this.output.textContent = lines.join('\n');
  }

  /** Sucesso: mensagem, trava a edicao e fecha apos 1500ms. */
  private finishSolved(): void {
    this.input.readOnly = true;
    this.invokeBtn.disabled = true;
    this.output.style.color = TEXT_GREEN;
    this.output.textContent += '\n\nO selo se desfaz. A mente prevalece.';
    window.setTimeout(() => {
      this.settle({
        solved: true,
        success: true,
        message: 'Puzzle resolvido.',
        attempts: this.attemptsUsed + 1,
        timeSeconds: this.elapsedSeconds(),
      });
    }, 1500);
  }

  /** Tentativas esgotadas: fecha apos 2000ms com penalidade de HP. */
  private finishExhausted(): void {
    this.input.readOnly = true;
    this.invokeBtn.disabled = true;
    this.output.style.color = TEXT_RED;
    this.output.textContent += '\n\nA mente vacila. O conhecimento cobra seu preco.';
    window.setTimeout(() => {
      this.settle({
        solved: false,
        success: false,
        message: 'Tentativas esgotadas.',
        attempts: this.attemptsUsed,
        penalty: PENALTY_FAIL,
        timeSeconds: this.elapsedSeconds(),
      });
    }, 2000);
  }

  /** Abandono imediato, com penalidade maior. */
  private abandon(): void {
    if (!this.puzzle) return;
    this.settle({
      solved: false,
      success: false,
      message: 'Puzzle abandonado.',
      attempts: this.attemptsUsed,
      penalty: PENALTY_ABANDON,
      timeSeconds: this.elapsedSeconds(),
    });
  }

  /** Mostra a dica e emite evento para o jogo deduzir XP. */
  private showHint(): void {
    if (!this.puzzle) return;
    this.output.style.color = TEXT_HINT;
    this.output.textContent = `Dica: ${this.puzzle.hint || 'Nenhuma dica disponivel.'}`;
    EventBus.emit('puzzle:hint', { puzzleId: this.puzzle.id });
  }

  // --- Helpers de UI --------------------------------------------------------

  private renderLanguageSelector(language: TerminalLanguage): void {
    this.langBar.replaceChildren();
    if (language !== 'both') {
      this.langBar.style.display = 'none';
      return;
    }
    this.langBar.style.display = 'flex';
    (['js', 'python'] as const).forEach((lang) => {
      const b = button(lang === 'js' ? 'JavaScript' : 'Python', lang === this.activeLang ? '#4a3f6b' : '#241f33');
      b.style.flex = '0 0 auto';
      b.addEventListener('click', () => this.switchLanguage(lang, language));
      this.langBar.append(b);
    });
  }

  /** Troca a aba de linguagem preservando o código já digitado em cada uma. */
  private switchLanguage(lang: 'js' | 'python', language: TerminalLanguage): void {
    if (lang === this.activeLang) return;
    this.codeByLang[this.activeLang] = this.input.value; // guarda o que foi editado
    this.activeLang = lang;
    this.input.value = this.codeByLang[lang];
    this.renderLanguageSelector(language);
    this.updateHeader();
    this.input.focus();
  }

  /** Atualiza o cabeçalho com a linguagem ativa (tag [JS]/[PYTHON]). */
  private updateHeader(): void {
    if (!this.puzzle) return;
    const tag = this.languageTag(this.puzzle.language);
    this.header.textContent = `PROVA DA MENTE — ANDAR ${this.puzzle.floor} [${tag}]`;
  }

  private renderAttempts(): void {
    this.attemptsEl.textContent = `Tentativas restantes: ${Math.max(0, this.attemptsLeft)}`;
  }

  private languageTag(language: TerminalLanguage): string {
    if (language === 'both') return this.activeLang === 'python' ? 'PYTHON' : 'JS';
    if (language === 'python') return 'PYTHON';
    if (language === 'none') return 'ENIGMA';
    return 'JS';
  }

  private playEntrance(): void {
    this.root.style.transition = 'none';
    this.root.style.opacity = '0';
    this.root.style.transform = 'translate(-50%, -50%) scale(0.95)';
    // Forca reflow para a transicao valer a partir do estado inicial.
    void this.root.offsetWidth;
    this.root.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    this.root.style.opacity = '1';
    this.root.style.transform = 'translate(-50%, -50%) scale(1)';
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // Tab insere 2 espacos em vez de mudar o foco.
    if (e.key === 'Tab') {
      e.preventDefault();
      this.insertAtCursor('  ');
      return;
    }
    // Ctrl/Cmd + Enter executa.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void this.invoke();
      return;
    }
    // Enter mantém a indentação da linha atual (e aprofunda apos `:` ou `{`),
    // essencial para escrever Python (sensivel a indentacao) num textarea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.insertAtCursor(`\n${this.nextLineIndent()}`);
    }
  };

  /** Insere `text` na posicao do cursor, reposicionando-o ao fim do inserido. */
  private insertAtCursor(text: string): void {
    const start = this.input.selectionStart;
    const end = this.input.selectionEnd;
    const value = this.input.value;
    this.input.value = value.slice(0, start) + text + value.slice(end);
    this.input.selectionStart = this.input.selectionEnd = start + text.length;
  }

  /** Indentacao para a proxima linha: a da linha atual, +2 espacos apos `:`/`{`. */
  private nextLineIndent(): string {
    const start = this.input.selectionStart;
    const value = this.input.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.slice(lineStart, start);
    const indent = line.match(/^[ \t]*/)?.[0] ?? '';
    const trimmed = line.trimEnd();
    return trimmed.endsWith(':') || trimmed.endsWith('{') ? `${indent}  ` : indent;
  }

  private elapsedSeconds(): number {
    return Math.round((performance.now() - this.startMs) / 1000);
  }

  /** Resolve a Promise pendente e esconde o overlay (apenas uma vez). */
  private settle(result: PuzzleResult): void {
    const resolve = this.resolve;
    this.resolve = undefined;
    this.puzzle = undefined;
    this.invokeBtn.disabled = false;
    this.root.hidden = true;
    resolve?.(result);
  }
}

// --- Fabricas e estilos -----------------------------------------------------

function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  return node;
}

function button(label: string, bg: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    `padding:8px 14px;border:1px solid #4a3f6b;border-radius:4px;background:${bg};` +
    `color:#cfe8cf;font-family:'Courier New',monospace;font-size:13px;cursor:pointer;`;
  return b;
}

const PY_DEF = /\bdef\s+\w+\s*\([^)]*\)\s*:/;
const JS_FN = /\bfunction\b|=>/;
/** Primeiro construto "de topo" de cada linguagem (onde o programa de fato começa). */
const PY_START = /\bdef\s+\w+\s*\(|\b(?:import|from|class)\b/;
const JS_START = /\bfunction\b|\b(?:const|let|var)\b|=>/;

/**
 * Decide qual linguagem rodar a partir do conteúdo do editor. Cobre o caso comum
 * de escrever numa linguagem enquanto o starter da outra ainda está no buffer:
 * isola o programa da linguagem detectada **a partir do seu primeiro construto**,
 * descartando o starter da outra e qualquer lixo antes (ex.: um `}e ` perdido).
 * Sem sinal claro, respeita a aba ativa.
 */
export function resolveRun(raw: string, active: 'js' | 'python'): { lang: 'js' | 'python'; code: string } {
  const hasPy = PY_DEF.test(raw);
  const hasJs = JS_FN.test(raw);

  if (hasPy && !hasJs) return { lang: 'python', code: raw };
  if (hasJs && !hasPy) return { lang: 'js', code: raw };

  if (hasPy && hasJs) {
    const pyAt = raw.search(PY_START);
    if (pyAt >= 0) {
      const code = raw.slice(pyAt);
      if (!JS_FN.test(code)) return { lang: 'python', code };
    }
    const jsAt = raw.search(JS_START);
    if (jsAt >= 0) {
      const code = raw.slice(jsAt);
      if (!PY_DEF.test(code)) return { lang: 'js', code };
    }
  }
  return { lang: active, code: raw };
}

/**
 * Deriva um esqueleto Python a partir do starter JS (`function nome(args) {…}`),
 * preservando o nome da função e os parâmetros. Usado quando o jogador alterna
 * para a aba Python num puzzle `both`, cujos dados só trazem o starter JS.
 */
function pythonStarterFrom(jsStarter: string): string {
  const match = jsStarter.match(/function\s+(\w+)\s*\(([^)]*)\)/);
  const name = match?.[1] ?? 'solution';
  const params = (match?.[2] ?? '').trim();
  return `def ${name}(${params}):\n  # seu código aqui\n  pass`;
}

/** Formata um valor para o log de testes. */
function fmt(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

const TEXT_GREEN = '#a0e0a0';
const TEXT_RED = '#e08a8a';
const TEXT_HINT = '#d0b0ff';

const ROOT_STYLE = `
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(680px,94vw);max-height:90vh;overflow:auto;z-index:50;box-sizing:border-box;
  background:rgba(0,0,0,0.93);border:2px solid #4a3f6b;border-radius:8px;padding:20px;
  color:${TEXT_GREEN};font-family:'Courier New',monospace;
  box-shadow:0 0 48px rgba(74,63,107,0.6);`;

const HEADER_STYLE = `
  margin:0 0 12px;font-size:16px;font-weight:bold;letter-spacing:1px;color:#c9b8ff;
  border-bottom:1px solid #4a3f6b;padding-bottom:8px;`;

const LORE_STYLE = `margin:0 0 10px;font-style:italic;color:#c4a8e8;font-size:13px;line-height:1.5;`;

const DESC_STYLE = `margin:0 0 12px;color:#ffffff;font-size:14px;line-height:1.5;white-space:pre-wrap;`;

const LANGBAR_STYLE = `display:none;gap:8px;margin:0 0 10px;`;

const INPUT_STYLE = `
  width:100%;min-height:180px;resize:vertical;box-sizing:border-box;
  background:#05060a;color:${TEXT_GREEN};border:1px solid #4a3f6b;border-radius:4px;
  padding:10px;font-family:'Courier New',monospace;font-size:13px;line-height:1.5;tab-size:2;`;

const OUTPUT_STYLE = `
  margin:10px 0 0;min-height:24px;max-height:180px;overflow:auto;white-space:pre-wrap;
  color:${TEXT_GREEN};font-size:13px;line-height:1.45;`;

const FOOTER_STYLE = `
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  margin-top:14px;flex-wrap:wrap;`;

const ATTEMPTS_STYLE = `color:#c9b8ff;font-size:13px;`;
