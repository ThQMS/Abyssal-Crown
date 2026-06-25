# Escala e evolução

Como o Abyssal Crown pode crescer sem se quebrar. A ideia central: **o conteúdo
é dados**, então a maior parte do crescimento é editar JSON, não reescrever
código.

## v1 — atual

- **10 andares**, 4 classes, 40 puzzles, **5 biomas** (tema por faixa de andar).
- Combate por turnos (com cooldowns, dano físico/mágico e RNG semeada),
  skill trees, névoa de guerra, geração BSP determinística, inimigos que
  perseguem (A* + linha de visão) e encontros com bando.
- Puzzles em **JS executado em Web Worker** (timeout real contra loop infinito)
  e Python via Pyodide.
- Persistência em **localStorage** (sem backend).
- Suíte de **testes (Vitest)** cobrindo RNG, dano, A*/conectividade e conteúdo.
- Hospedagem estática no **GitHub Pages** (`npm run deploy`).

## v2 — sem backend, só conteúdo e sistemas

Tudo isto é alcançável sem servidor:

- **Mais andares** apenas editando `puzzles.json` / `enemies.json` e ajustando o
  número de andares na geração — nenhum novo subsistema.
- **New Game+**: reiniciar mantendo skills/itens, com inimigos mais fortes
  (multiplicador de stats por ciclo).
- **Novos elementos** e status: estender a união `Element`/`StatusEffectType` em
  `types` e a tabela em `ElementSystem` — os dados (afinidades) não mudam de forma.
- **Novos tipos de puzzle**: adicionar uma classe em `puzzle/puzzles/` e registrá-la.
- **Mais classes/itens/skills**: puro JSON.

## v3 — backend opcional

Recursos que pedem um servidor, mas que **encaixam sem reescrever o jogo**:

- **Ranking global** (tempo até o boss, andar máximo, puzzles resolvidos).
- **Save na nuvem**: reimplementar `SaveSystem` falando com uma API, mantendo a
  mesma assinatura — o resto do jogo não percebe a diferença.
- **Editor comunitário de puzzles**: como puzzles são `PuzzleData` em JSON,
  um editor web pode gerar e compartilhar arquivos diretamente.

## O que NÃO mudar

Estes são os contratos de estabilidade. Quebrá-los obriga a mexer no jogo inteiro:

- **O formato de `puzzles.json`** (`PuzzleData`): convenção da função `solution`,
  `input` como lista de argumentos, `testCases`/`reward`. É a fundação do
  conteúdo e de um possível editor comunitário.
- **A interface `IGameState`** (`enter`/`update`/`render`/`exit`): todo estado de
  jogo depende dela; a `GameStateMachine` a assume.
- **O `EventBus`** e seus nomes de evento: é a cola entre os sistemas. Renomear
  ou remover eventos quebra o desacoplamento.

Mantendo esses três estáveis, v2 e v3 são extensões — não reescritas.

Detalhes de cada subsistema em [ARCHITECTURE.md](./ARCHITECTURE.md).
