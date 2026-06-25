# Assets

## O 0x72 DungeonTileset II

Toda a arte do jogo vem do **DungeonTileset II**, de **0x72**.

- Fonte: <https://0x72.itch.io/dungeontileset-ii>
- Autor: 0x72 (Robert)
- Licença: **CC0 / domínio público** — livre para usar, modificar e distribuir;
  atribuição é apreciada, mas não obrigatória.

O pacote fica em `src/assets/dungeon/`:

```
dungeon/
  frames/                       370 frames PNG individuais de 16×16(–32)
  atlas_floor-16x16.png         atlas de chão (empacotado)
  atlas_walls_low-16x16.png     atlas de paredes (baixo)
  atlas_walls_high-16x32.png    atlas de paredes (alto)
  0x72_DungeonTilesetII_v1.7.png  a folha completa
  README, tile_list_v1.7        docs do autor (coordenadas dos frames)
```

Carregamos os **frames individuais** (não os atlas) porque PNGs por frame se
mapeiam de forma limpa para um registro indexado por nome e para o
content-hashing do Vite.

## Como os frames são carregados

`src/engine/SpriteRegistry.ts` descobre cada frame em tempo de build:

```ts
const FRAME_URLS = import.meta.glob('@/assets/dungeon/frames/*.png', {
  eager: true, query: '?url', import: 'default',
});
```

Cada frame é indexado pelo seu **nome base, sem extensão**:

```
frames/goblin_idle_anim_f0.png   →   chave "goblin_idle_anim_f0"
frames/flask_red.png             →   chave "flask_red"
```

Os frames são minúsculos, então o Vite os **embute como data URIs** (abaixo do
limite padrão de 4 KB). O pacote inteiro viaja dentro do bundle JS — um único
download, sem cascata de 370 requisições. O `SpriteRegistry.loadAll()` os
decodifica em `HTMLImageElement`s no boot.

## Convenções de nomes

O pacote segue sufixos consistentes, dos quais o registro depende:

| Padrão | Significado | Exemplo |
|---|---|---|
| `<base>_idle_anim_f0..f3` | loop de "parado" (4 frames) | `knight_m_idle_anim_f0` |
| `<base>_run_anim_f0..f3` | loop de "correndo" (4 frames) | `goblin_run_anim_f3` |
| `<base>_hit_anim_f0` | frame único de dano | `elf_f_hit_anim_f0` |
| `<base>` (sem sufixo) | objeto/item estático | `flask_red`, `crate` |

`SpriteRegistry.animation(base, 'idle'|'run'|'hit')` resolve um nome base para uma
`SpriteAnimation` ordenada, com fallback para um único frame estático chamado
`<base>`.

A renderização usa `RENDER_TILE = 32` (os 16 px nativos escalados ×2) com
`imageSmoothingEnabled = false`, para pixels nítidos. Sprites de personagem mais
altos são ancorados na base do seu tile (ver `ExploringState.drawEntitySprite`).

## Quais sprites o conteúdo usa

Estes são referenciados em `src/data/*.json`. Mantenha conteúdo novo apenas com
nomes que existam em `frames/`.

- **Classes do jogador** (`classes.json` → `sprite`): `knight_m` (Cavaleiro
  Amaldiçoado), `wizzard_m` (Arquimago Exilado), `knight_f` (Paladino Caído),
  `necromancer` (Necromante Solitário). Outras opções no pacote: `wizzard_f`,
  `elf_m`, `elf_f`, `lizard_m`, `lizard_f`, `dwarf_m`, `dwarf_f`.
- **Inimigos** (`enemies.json` → `sprite`): `goblin`, `imp`, `skelet`,
  `orc_warrior`, `orc_shaman`, `ice_zombie`, `chort`, `necromancer`,
  `big_demon`. Também disponíveis: `masked_orc`, `ogre`, `big_zombie`, `swampy`,
  `muddy`, `slug`, `wogol`, `pumpkin_dude`, `zombie`, `doc`, `angel`.
- **Itens** (`items.json` → `sprite`): as poções `flask_*` e as armas `weapon_*`
  (espadas/cajados).
- **Tiles do mundo** (fixos em `ExploringState`): `wall_mid`, `floor_1..8`,
  `floor_stairs`, `doors_leaf_open`.
- **Baús** (`entities/Chest.ts`): `chest_full_open_anim_f0` (fechado),
  `chest_empty_open_anim_f2` (aberto).
- **Inscrições** (`entities/Inscription.ts`): `wall_banner_blue` (lore),
  `wall_banner_red` (com puzzle).
- **HUD** (`ui/HUD.ts`): `ui_heart_full`, `ui_heart_half`, `ui_heart_empty`.

## Adicionando mais arte

Coloque novos PNGs em `src/assets/dungeon/frames/` (ou numa pasta irmã) e eles
serão captados automaticamente pelo glob no próximo build. Se adicionar imagens
grandes, aumente/desative o `build.assetsInlineLimit` no `vite.config.ts` para que
sejam emitidas como arquivos separados com hash de cache, em vez de embutidas.
