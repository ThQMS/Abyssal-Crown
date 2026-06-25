import { describe, it, expect } from 'vitest';
import { resolveRun } from '@/puzzle/ArcaneTerminal';

const PY = `def solution(numeros):\n  count = 0\n  for n in numeros:\n    if n % 2 == 0:\n      count += 1\n  return count`;
const JS = `function solution(numeros) {\n  return numeros.filter((n) => n % 2 === 0).length;\n}`;
const JS_STARTER = `function solution(numeros) {\n  // seu código aqui\n}`;

describe('resolveRun (detecção de linguagem do puzzle)', () => {
  it('detecta Python puro mesmo na aba JS', () => {
    const { lang, code } = resolveRun(PY, 'js');
    expect(lang).toBe('python');
    expect(code).toContain('def solution');
  });

  it('detecta JS puro mesmo na aba Python', () => {
    const { lang } = resolveRun(JS, 'python');
    expect(lang).toBe('js');
  });

  it('roda Python quando o starter JS vazio sobrou em cima', () => {
    const mixed = `${JS_STARTER}\n${PY}`;
    const { lang, code } = resolveRun(mixed, 'js');
    expect(lang).toBe('python');
    expect(code).not.toContain('function solution'); // starter vazio removido
    expect(code).toContain('def solution');
    expect(code.startsWith('def solution')).toBe(true); // começa limpo no def
  });

  it('descarta lixo entre o starter JS e o Python (ex.: "}e def")', () => {
    const junk = `function solution(numeros) {\n  // seu código aqui\n}e ${PY}`;
    const { lang, code } = resolveRun(junk, 'js');
    expect(lang).toBe('python');
    expect(code.startsWith('def solution')).toBe(true); // sem o "}e " perdido
    expect(code).not.toContain('function');
  });

  it('respeita a aba ativa quando não há código (só o starter)', () => {
    expect(resolveRun(JS_STARTER, 'js').lang).toBe('js');
  });
});
