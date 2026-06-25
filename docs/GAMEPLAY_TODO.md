# Jogabilidade — backlog de melhorias

Documento vivo para melhorias gerais de jogabilidade (fora do combate). As
melhorias de combate originais (painéis de status, painel de descrição, animação
de morte + tela de espólios) já foram concluídas e deram origem ao sistema de
itens/equipamento/inventário e à invocação de aliados — ver
[ARCHITECTURE.md](./ARCHITECTURE.md) e [ADDING_CONTENT.md](./ADDING_CONTENT.md).

Legenda de `Status`: `📋 a fazer` · `🔧 em andamento` · `✅ feito` · `❓ a confirmar`

Arquivos centrais:
- `src/engine/GameStateMachine.ts` — pilha de estados (overlays `transparent`).
- `src/engine/states/*` — estados do jogo.
- `src/engine/InputManager.ts` — teclado/mouse (`isHeld`, `consumePressed`, bindings).
- `src/engine/AudioManager.ts` — volume/mute (sem UI hoje).
- `src/persistence/SaveSystem.ts` — localStorage (jogo).

---

## 1. Menu de Pause
**Status:** ✅ feito

**Entregue:** o **Esc** em jogo abre o menu de pausa — implementado como a
`SettingsState` em modo "em jogo" (`{ inGame: true }`), com título **Pausa** e as
opções **Volume / Som / Tela cheia / Salvar jogo / Sair para o título /
Continuar**. É um overlay `transparent` sobre a exploração. A tecla **P** continua
como atalho de salvar rápido.

**Estado original:**
- **Não existia** estado de pausa. A tecla **P** (`InputAction.Pause`)
  **salvava o jogo direto** no `ExploringState` (chama `saveGame()`).

**Proposta:**
- Novo `GameStateId.Pause` + `PauseState` como **overlay** (`transparent = true`)
  sobre a exploração — o mapa congela atrás (a máquina só atualiza o topo da
  pilha).
- Opções: **Retomar**, **Configurações**, **Salvar jogo**, **Sair para o menu**.
- Abrir/fechar com **Esc** (e/ou P). Rever o binding: mover "salvar" para dentro
  do menu de pause em vez de ser a ação solta da tecla P.
- Suporte a mouse (hover + clique), consistente com o menu inicial.

**Implementação prevista:**
- `GameStateId.Pause`, `PauseState`, `PauseUI`.
- `ExploringState` passa a `push(GameStateId.Pause)` em vez de salvar direto.

---

## 2. Menu de Configurações
**Status:** ✅ feito

**Entregue:** `SettingsState` + `SettingsUI`, acessível pelo **título** e pelo
**menu de pausa**. Opções: **Volume** (←/→), **Som** (mudo) e **Tela cheia**. As
preferências de áudio persistem numa chave **separada** (`abyssal_crown_audio`),
fora do save de jogo. Remapear teclas fica como evolução futura.

**Estado original:**
- **Não existia** UI de configurações. O `AudioManager` já tinha `setVolume()` e
  `toggleMute()`, mas nada os expunha ao jogador.

**Proposta:**
- `SettingsState` + `SettingsUI`, acessível pelo **menu inicial** e pelo **menu
  de pause**.
- Opções iniciais:
  - **Volume** (mestre / efeitos / música) e **mudo**.
  - Escala/zoom de render (se fizer sentido).
  - (Futuro) **remapear teclas** — o `InputManager` já guarda `bindings`.
- **Persistir as preferências** em `localStorage`, em chave **separada** do save
  de jogo (ex.: `abyssal_crown_settings`), para não misturar com o progresso.

**Implementação prevista:**
- `GameStateId.Settings`, `SettingsState`, `SettingsUI`.
- Pequeno módulo `Settings`/`SettingsStore` (carrega/salva preferências).

---

## 3. Movimento contínuo ao segurar a direção
**Status:** 📋 a fazer

**Estado atual:**
- Movimento é **edge-triggered**: cada pressionar de seta/WASD anda **1 casa**.
  Segurar a tecla **não** continua andando.
- O `InputManager` já oferece `isHeld(action)` — dá pra ler o estado contínuo.

**Proposta:**
- Enquanto a direção estiver **pressionada**, repetir o passo automaticamente até
  soltar:
  - 1º passo **imediato** ao pressionar;
  - depois um **atraso inicial** (~180ms) e então **repetição** a cada ~130ms
    (valores a calibrar; idealmente configuráveis).
- Implementar no `ExploringState.update(dt)` lendo `isHeld` das 4 direções, com um
  acumulador de tempo.
- Cada passo continua disparando `stepEnemies()` (perseguição) e a checagem de
  escada/colisão — o jogo segue em grade, só automatiza o "tap" repetido.

**Decisão:** ✅ velocidade dos valores propostos (~180ms inicial, ~130ms
repetição) está boa. Mantemos esses valores; podem virar ajuste no menu de
configurações depois.

---

## 4. Monstros andando (perambular / patrulha)
**Status:** 📋 a fazer

**Estado atual:**
- Inimigos só se movem quando **perseguem** o jogador (dentro do raio de aggro +
  linha de visão, e somente quando o jogador anda — `stepEnemies()`).
- **Fora do aggro, ficam 100% parados** no ponto onde nasceram.

**Proposta:**
- Quando **não** estão perseguindo, dar a eles um comportamento de
  **perambular** (wander): a cada tick de movimento, chance de dar um passo
  aleatório dentro da **sala de origem** (ou de um raio em torno do spawn),
  respeitando paredes e sem empilhar com outras entidades.
- Manter **determinístico** usando a `RNG` da run (sem `Math.random`).
- Opcional/futuro: pequena máquina de estados de exploração por inimigo
  (`idle` → `patrulha` → `perseguição` → `retorno ao posto`).

**Decisão:** ✅ os monstros **podem vagar pelos corredores também** (não ficam
restritos à sala de origem). A perambulação respeita paredes/colisão; sem limite
de sala — apenas o raio/chance de passo para não andarem rápido demais.

**Implementação prevista:**
- Estender `stepEnemies()` no `ExploringState`: ramo "fora de aggro" faz o wander
  (passo aleatório ocasional em qualquer tile passável adjacente, corredores
  inclusos).
- Opcional: leve tendência de continuar na mesma direção (evita "tremer" no lugar).

---

## 5. Fluxo de telas iniciais (Título → Menu principal → Seleção de classe)
**Status:** ✅ feito

**Entregue:** o jogo entra no `TitleState` — a **entrada da masmorra** (arco de
paredes do pacote + escada + brilho arcano) com o nome **ABYSSAL CROWN** e o menu
**Continuar / Jogar / Configurações**. "Jogar" leva ao `MainMenuState`, agora
**só a seleção de classe** (os cards), de onde **Esc volta ao título**. Não criei
um `CharacterSelectState` à parte: o `MainMenuState` passou a ser essa tela.

**Estado original:**
- O jogo entrava **direto** no `MainMenuState`, que misturava tudo numa tela só:
  título + "Continuar" + **seleção de personagem** (os cards).

**Proposta — três telas encadeadas:**
1. **Tela de Título (splash):** arte de **masmorra ao fundo** + nome do jogo
   **"ABYSSAL CROWN"** + chamada "Pressione qualquer tecla ou clique para
   começar". Pode ter leve animação (a entrada que já fizemos) e tochas/partículas.
2. **Menu principal:** botões **Iniciar jogo**, **Continuar** (só se houver save),
   **Configurações** e (opcional) **Créditos**. Com mouse + teclado.
3. **Seleção de personagem:** os cards atuais (já prontos), agora como uma tela
   própria, com opção de **voltar** ao menu principal.

**Ideia para o fundo de masmorra:**
- Gerar um `DungeonLevel` apenas decorativo (sem jogador/colisão), com a câmera
  passeando devagar, OU desenhar um recorte estático escurecido. A primeira opção
  reaproveita o renderizador de tiles e fica "vivo".

**Implementação prevista:**
- Novos estados: `GameStateId.Title` (`TitleState`) e `GameStateId.MainMenu`
  como **menu de botões**; a seleção de classe atual vira `CharacterSelectState`
  (`GameStateId.CharacterSelect`).
- Fluxo: `Title` → `MainMenu` → (`CharacterSelect` → jogo) ou (`Continuar` → jogo)
  ou (`Configurações` → `Settings`, item 2).
- Reusar `MainMenuUI` (cards) na tela de seleção; criar `TitleUI` e `MainMenuUI`
  de botões (ou um `MenuUI` genérico).

---

## 6. Voltar ao menu principal durante o jogo
**Status:** ✅ feito

**Entregue:** o menu de pausa (item 1) tem **"Sair para o título"**, que faz
`machine.change(GameStateId.Title)`. Há uma opção **"Salvar jogo"** separada logo
acima; hoje sair **não** salva automaticamente (sem diálogo de confirmação ainda).
O `GameOverState` também passou a voltar ao **título**.

**Estado original:**
- Durante o jogo **não havia** como sair para o menu. Só ao morrer.

**Proposta:**
- Opção **"Sair para o menu principal"** dentro do **menu de pause** (item 1)
  e/ou das **configurações** (item 2).
- Ao escolher: oferecer **salvar antes** (ou salvar automaticamente, já que o
  autosave existe) e então `change(GameStateId.MainMenu)` — voltando à **tela de
  menu principal** (item 5), não à seleção de classe.
- Pedir **confirmação** ("Sair? O progresso não salvo será perdido") para evitar
  saída acidental.

**Implementação prevista:**
- Item do `PauseUI`/`SettingsUI` que chama `game.saveGame()` (se desejado) e
  `machine.change(GameStateId.MainMenu)`.

---

## Notas
- Pause e Configurações compartilham o padrão de **overlay + mouse** já usado no
  menu inicial (reaproveitar `roundRect`/`wrapText` e o layout com hit-test).
- Movimento contínuo e perambulação dos monstros mexem no mesmo laço de turno do
  `ExploringState` — implementar com cuidado para não acelerar demais o ritmo
  nem deixar a perseguição injusta.
