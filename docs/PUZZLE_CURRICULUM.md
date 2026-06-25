# Currículo de puzzles

Abyssal Crown é também um treinador suave de **pensamento computacional**. Cada
andar tem **4 puzzles** (1 obrigatório, que destranca a escada, + 3 opcionais com
recompensa maior). A dificuldade sobe de **1 a 5** conforme você desce.

São **40 puzzles** no total, organizados por tema:

| Andar | Tema | Puzzles incluídos |
|---|---|---|
| 1 | **Fundamentos** — loops e condicionais | pares em lista, soma de positivos, maior valor, palíndromo |
| 2 | **Strings** — manipulação de texto | contar vogais, FizzBuzz, inverter string, comprimir string |
| 3 | **Funções** — definição e uso | fatorial, potência (sem `**`), contar ocorrências, remover duplicatas |
| 4 | **Funções avançadas** | anagrama, interseção de listas, achatar lista, soma dos dígitos |
| 5 | **Listas** | two sum, rotacionar lista, subarray de soma máxima, produto exceto si |
| 6 | **Dicionários** | inverter dicionário, contar frequência, agrupar por inicial, merge de dicts |
| 7 | **Algoritmos** | busca binária, bubble sort, merge de listas ordenadas, número de ilhas |
| 8 | **Algoritmos II** | dois ponteiros, pilha com `min()`, agrupar anagramas, comprimir runs |
| 9 | **Recursão** | Fibonacci, Torre de Hanói, achatar aninhado profundo, potência recursiva |
| 10 | **Boss composto** | busca por prefixo → encontrar padrão → decifrar cifra (+ bônus: MDC) |

## Filosofia de design

- **Cedo é rápido.** Os puzzles do andar 1–2 se resolvem em menos de um minuto:
  o objetivo é dar confiança e ensinar o loop do terminal.
- **Contratos explícitos.** Toda descrição nomeia a função (`solution`), seus
  parâmetros e o retorno esperado. Os `testCases` incluem casos de borda (lista
  vazia, único elemento, ausência de solução).
- **Dificuldade = recompensa.** O `reward.xp` acompanha a `difficulty`; puzzles
  opcionais valem mais XP e alguns soltam itens.
- **Dica tem custo.** Pedir a dica no terminal desconta um pouco de XP — incentiva
  tentar antes de espiar.

## O Boss (Andar 10)

As três fases são **sequenciais e todas obrigatórias**, encadeando as
habilidades dos andares anteriores:

1. **Litania dos Prefixos** — busca em lista de strings por prefixo.
2. **O Padrão na Sequência** — usar busca para localizar um padrão (subsequência).
3. **A Senha da Maldição** — usar o padrão para decifrar uma cifra de César.

Um quarto puzzle opcional (MDC pelo algoritmo de Euclides) guarda a relíquia
bônus do andar.

## Onde a execução acontece

- **JavaScript:** roda num **Web Worker** (`src/puzzle/jsRunner.worker.ts`), com
  o núcleo puro em `src/puzzle/jsSandbox.ts` e a orquestração em
  `src/puzzle/JsRunner.ts`. Como a execução fica numa thread separada, um laço
  infinito no código do jogador trava apenas o worker — a thread principal o mata
  com `worker.terminate()` ao estourar 2s (timeout *real*). Globais perigosos
  (`fetch`, `localStorage`, `document`…) são sombreados; ainda assim é uma
  conveniência, **não** uma fronteira de segurança (o jogador só executa o próprio
  código, localmente).
- **Python:** `src/puzzle/PyodideRunner.ts` — carrega o Pyodide (WASM) sob demanda
  na primeira execução em Python.

Para criar ou ajustar puzzles, ver [ADDING_CONTENT.md](./ADDING_CONTENT.md).
