# Arquitetura

**Abyssal Crown** é um roguelike de masmorra por turnos em que os cofres do
abismo são destrancados resolvendo **puzzles de programação e lógica**. Tudo roda
no navegador, sem backend.

## Stack técnica

| Camada | Tecnologia | Papel |
|---|---|---|
| Linguagem | **TypeScript** (`strict: true`) | Tipagem forte de ponta a ponta |
| Build/dev | **Vite** | Dev server com HMR e bundle de produção |
| Render | **Canvas 2D** | Todo o jogo é desenhado num único `<canvas>` |
| Python | **Pyodide** (WASM, sob demanda) | Executa puzzles em Python no navegador |
| Persistência | **localStorage** | Saves locais, sem servidor |
| Hospedagem | **GitHub Pages** | Estático, gratuito e permanente |
| Arte | **0x72 DungeonTileset II** (CC0) | Sprites 16×16 |

> O projeto compila sob `verbatimModuleSyntax` + `erasableSyntaxOnly`: não há
> `enum`s nem _parameter properties_; usamos objetos `as const` com uniões
> derivadas (ver `src/types/index.ts`).

## Mapa de pastas

```
src/
  engine/        laço do jogo, máquina de estados, input, câmera, áudio, sprites
    states/      Title, MainMenu (seleção de classe), Settings, Exploring, Combat,
                 Puzzle, Dialogue, LevelUp, Loot, Inventory, GameOver
  world/         tilemap, geração BSP, névoa de guerra, andares da masmorra
  entities/      Entity base, Player, Enemy, Minion, Chest, Inscription, Animator
  combat/        fila de turnos, dano, elementos, status, skills, IA inimiga
  items/         ItemFactory (raridade/afixos), LootSystem (loot por andar), ItemText
  puzzle/        PuzzleSystem, runners JS/Python, terminal arcano
    puzzles/     classes de puzzle (Code/Logic/Cipher/Pattern)
  ui/            HUD, CombatUI, LootUI, InventoryUI, TitleUI, SettingsUI, SkillTreeUI,
                 ItemIcon, telas (menu/diálogo/game over), partículas
  persistence/   SaveSystem + SaveData (localStorage versionado, com migração v1→v2)
  data/          conteúdo em JSON: classes, enemies, skills, puzzles, lore, items
  utils/         RNG determinística, helpers de matemática e cor
  types/         definições de tipos compartilhadas
docs/            esta documentação
```

### Responsabilidade de cada camada

- **engine/** — orquestra tudo. O `Game` é a raiz: possui o canvas, todos os
  subsistemas, o catálogo de dados e o estado da run. A `GameStateMachine` é uma
  pilha de estados (`change`/`push`/`pop`); estados marcados como `transparent`
  deixam o estado de baixo continuar desenhando (overlays como puzzle, espólios,
  inventário e pausa). O fluxo de entrada é **Title → MainMenu (classe) → jogo**;
  `Settings` é um overlay aberto pelo título ou pela pausa (Esc) em jogo.
- **world/** — geometria procedural. `BSPGenerator` particiona o espaço em salas
  e corredores de forma **determinística** a partir de uma seed (derivada apenas do
  andar); `FogOfWar` faz _shadowcasting_, carimba `tile.fogState` e serializa os
  tiles descobertos. `DungeonLevel.serializeProgress/restoreProgress` salvam e
  reaplicam o estado mutável do andar.
- **entities/** — objetos do grid. `Entity` traz posição, stats, animação e
  `takeDamage`. `Player` mantém `baseStats` vs `stats` efetivos, equipamento e os
  `minions`; `Enemy` tem `spawnKey` (identidade estável entre regenerações);
  `Minion` é o aliado invocado.
- **items/** — sistema de itens: `ItemFactory` rola raridade/afixos (instâncias
  `ItemInstance`), `LootSystem` gera espólios por andar (inimigos e baús) e
  `ItemText` formata nomes/bônus para a UI.
- **combat/** — combate por turnos: `TurnQueue` por velocidade, `DamageCalculator`,
  `ElementSystem` (tabela elemental), `StatusEffect`, `EnemyAI` e os aliados
  (`Minion`) invocados, que agem na fila e podem ser alvo dos inimigos.
- **puzzle/** — o coração temático. `PuzzleSystem` indexa os `PuzzleData`; o
  `ArcaneTerminal` (overlay) roda o código do jogador via `JsRunner` (sandbox
  `new Function`) ou `PyodideRunner` (Python em WASM). O terminal mantém um buffer
  por linguagem, faz auto-indentação e **detecta a linguagem pelo código** ao rodar.
- **ui/** — renderizadores de canvas: `HUD`, `CombatUI`, `LootUI`, `InventoryUI`,
  `TitleUI`, `SettingsUI`, `SkillTreeUI`, telas e `Particles`.
- **persistence/** — `SaveSystem`/`SaveData` em localStorage, com migração v1→v2.

## Regras arquiteturais

1. **Conteúdo só em JSON.** Classes, inimigos, skills, puzzles, lore e itens
   vivem em `src/data/*.json`, tipados pelas interfaces de `src/types`. Adicionar
   conteúdo **não exige escrever TypeScript** (ver [ADDING_CONTENT.md](./ADDING_CONTENT.md)).
2. **EventBus desacopla os sistemas.** Um `TypedEventBus` (singleton tipado em
   `engine/EventBus.ts`) liga os subsistemas por eventos (`enemy:defeated`,
   `puzzle:solved`, `combat:hit`, `toast`, ...). O combate não conhece a
   progressão; a progressão não conhece a renderização.
3. **Fixed timestep a 60 fps.** O laço (`Game.loop`) acumula o tempo e roda a
   simulação em passos fixos de `1000/60 ms`; a renderização recebe um `alpha`
   para interpolar posições. Isso mantém a física do jogo estável independente
   da taxa de quadros.
4. **`SaveSystem` é uma interface substituível.** Toda a persistência passa por
   uma única classe pequena. Trocar localStorage por um backend (save na nuvem)
   significa reimplementar `SaveSystem` mantendo a mesma assinatura — nada mais
   no jogo precisa mudar.

## Como o save funciona

- Persistência **100% local** via `localStorage`, numa única chave
  `abyssal_crown_v1`. **Não há backend.** (As preferências de áudio têm sua própria
  chave, `abyssal_crown_audio`.)
- O esquema está em **`SAVE_VERSION = 2`**. O payload (`SaveData`) guarda classe,
  nome, andar atual, **posição do jogador** no andar, seed do calabouco, os `stats`
  efetivos **e** os `baseStats` (intrínsecos, sem equipamento), skills
  desbloqueadas/equipadas, **pontos de habilidade**, inventário como instâncias
  (`ItemInstance`), itens equipados por slot, aliados invocados vivos, **progresso
  do andar** (`FloorProgress`: inimigos vivos por `spawnKey`, baús abertos e a névoa
  em base64), puzzles resolvidos, inimigos derrotados e tempo de jogo.
- **Migração v1→v2** (`migrateSave`): saves antigos (inventário de ids simples, sem
  equipamento) são convertidos ao carregar; campos ausentes têm padrão seguro.
- Como o layout de cada andar é **determinístico por andar**, regenerar o andar
  produz os mesmos inimigos/baús — o que permite reaplicar o `FloorProgress` por
  posição/`spawnKey` e retomar exatamente onde parou.
- **Quando salva:** ao descer escadas, ao fechar um puzzle e ao salvar pelo
  menu de pausa (Esc) ou pela tecla **P**. **Nunca salva durante o combate** —
  assim, fechar o navegador no meio de uma luta permite tentar de novo.

Ver também: [ADDING_CONTENT.md](./ADDING_CONTENT.md) ·
[PUZZLE_CURRICULUM.md](./PUZZLE_CURRICULUM.md) · [SCALING.md](./SCALING.md) ·
[ASSETS.md](./ASSETS.md)
