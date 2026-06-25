# Adicionando conteúdo

Quase todo o conteúdo do jogo é **dirigido por dados**: vive em arquivos JSON
dentro de `src/data/`, tipados pelas interfaces de `src/types/index.ts`. Na maior
parte dos casos você **não precisa escrever TypeScript** — basta editar um JSON,
salvar e o Vite recarrega na hora (`npm run dev`).

Depois de editar, rode `npm run build` para confirmar que o JSON ainda satisfaz
os tipos.

---

## Adicionar um puzzle (só editar `puzzles.json`)

Puzzles são 100% data-driven. Acrescente um objeto a `src/data/puzzles.json`
seguindo o formato `PuzzleData`. **A função do jogador deve se chamar `solution`**
e cada `input` é a **lista de argumentos** passada a ela.

```jsonc
{
  "id": "a3_p2",                       // único; convenção: a<andar>_p<n>
  "floor": 3,                          // andar onde aparece
  "required": false,                   // true = obrigatório para destrancar a escada
  "title": "A Chama Elevada",
  "lore": "Tochas se acendem em potências. 'Eleve sem o feitiço proibido...'",
  "type": "code",                      // code | logic | cipher | pattern
  "language": "both",                  // both | js | python | none
  "curriculum": "Funções: loops e multiplicação",
  "difficulty": 2,                     // 1 a 5
  "description": "Crie 'solution(base, expoente)' que retorna base^expoente sem usar **.",
  "starterCode": "function solution(base, expoente) {\n  // seu código aqui\n}",
  "testCases": [
    { "input": [2, 3], "expected": 8,  "description": "2^3" },
    { "input": [5, 0], "expected": 1,  "description": "Expoente zero" }
  ],
  "hint": "Multiplique a base por ela mesma 'expoente' vezes.",
  "reward": { "xp": 140, "itemId": "flask_big_blue" }   // itemId pode ser null
}
```

Regras do `input`:
- `input: [[1,2,3]]` chama `solution([1,2,3])` (um argumento que é uma lista).
- `input: [2, 3]` chama `solution(2, 3)` (dois argumentos).

A validação é por igualdade estrutural (via `JSON.stringify`). Para puzzles em
Python, o runner Pyodide é carregado sob demanda na primeira execução. O terminal
detecta a linguagem pelo código, então funciona mesmo sem trocar a aba.

Pronto — o puzzle entra no pool do seu andar. Na geração, o jogo **sorteia** um
puzzle do andar (mesma dificuldade) usando o RNG semeado — aleatório para o
jogador, mas reproduzível ao regenerar. Quanto mais puzzles você adicionar a um
andar, mais variedade no sorteio.

---

## Adicionar uma classe (`classes.json` + sprite)

Acrescente um objeto a `src/data/classes.json`. O `sprite` deve ser um nome-base
existente no pacote 0x72 (ex.: `knight_m`, `wizzard_f`, `elf_m`) — o renderizador
usa `<sprite>_idle_anim_fN` e `<sprite>_run_anim_fN`.

```jsonc
{
  "id": "ranger",
  "name": "Patrulheira do Véu",
  "description": "Rápida e precisa; luta nas sombras entre os mundos.",
  "sprite": "elf_f",
  "baseStats": {
    "hp": 90, "maxHp": 90, "mana": 60, "maxMana": 60,
    "atk": 12, "def": 9, "spd": 14, "crit": 0.12,
    "level": 1, "xp": 0, "xpToNext": 75,
    "mp": 60, "maxMp": 60, "attack": 12, "defense": 9, "magic": 10, "resistance": 8, "speed": 14
  },
  "hpPerLevel": 9, "manaPerLevel": 6, "atkPerLevel": 2, "defPerLevel": 2,
  "growth": { "maxHp": 9, "maxMp": 6, "atk": 2, "def": 2 },
  "startingSkills": ["strike", "firebolt"]
}
```

A classe aparece automaticamente no carrossel do menu inicial. Os `startingSkills`
referenciam ids de `skills.json`.

---

## Adicionar um inimigo (`enemies.json`)

```jsonc
{
  "id": "wraith",
  "name": "Espectro Faminto",
  "glyph": "w",                 // fallback em ASCII
  "color": "#9a6acd",           // cor do fallback
  "sprite": "necromancer",      // nome-base no pacote 0x72
  "stats": {
    "level": 4, "xp": 0, "hp": 40, "maxHp": 40, "mp": 12, "maxMp": 12,
    "attack": 14, "defense": 8, "magic": 12, "resistance": 10, "speed": 12
  },
  "affinities": { "fire": 1.25, "void": 0.5 },   // >1 fraqueza, <1 resistência
  "skills": ["firebolt"],                         // ids de skills.json
  "xpReward": 32,
  "behavior": "caster",          // aggressive | caster | defensive | berserker
  "loot": ["flask_blue"]         // ids de items.json (opcional)
}
```

Inimigos são distribuídos pelos andares conforme o `floor`/dificuldade na geração
do nível. O `behavior` é lido pela `EnemyAI` para decidir as ações em combate. O
`loot` é a base curada do drop — cada id é rolado em instância (raridade/afixos
escalam com o andar) pelo `LootSystem`.

---

## Adicionar um item (`items.json`)

Itens têm `kind`: `consumable`, `weapon`, `armor`, `relic` (acessório) ou `key`.
Equipamentos (weapon/armor/relic) dão **bônus de stats** via `modifiers` e ganham
**raridade + afixos** aleatórios ao dropar. O `tier` (1–3) define a faixa de andar
do loot.

```jsonc
{
  "id": "armor_chain",
  "name": "Cota de Malha",
  "description": "Elos de aço que absorvem golpes.",
  "kind": "armor",                 // weapon | armor | relic | consumable | key
  "sprite": "armor_chain",         // weapon_* existem no pacote; armor/relic usam placeholder
  "value": 90,
  "tier": 2,                       // 1..3 (banda de andar do loot)
  "modifiers": { "defense": 5, "resistance": 3, "maxHp": 8 }
}
```

- **Consumível**: `modifiers.hp`/`mp` curam os pools atuais; `maxHp`/`magic`/etc.
  são boosts **permanentes**.
- **Armas** têm sprite no pacote 0x72 e aparecem sobrepostas ao herói no combate;
  **armaduras/acessórios** não têm arte no pacote e usam um ícone-placeholder na UI.

---

## Adicionar uma skill de invocação (`skills.json`)

Uma skill com o campo `summon` invoca um aliado em vez de causar dano (use também
`support: true`). Os pré-requisitos (`requires`) definem em qual ramo/classe ela
aparece.

```jsonc
{
  "id": "raise_dead",
  "name": "Levantar Morto",
  "description": "Ergue um esqueleto leal que luta ao seu lado.",
  "element": "void",
  "mpCost": 14, "power": 0, "range": 0, "tier": 2,
  "support": true,
  "requires": ["poison_mist"],
  "summon": { "name": "Esqueleto", "sprite": "skelet", "hp": 24, "attack": 11, "count": 1 }
}
```

---

## Resumo

| Conteúdo | Arquivo | Precisa de TS? |
|---|---|---|
| Puzzle | `data/puzzles.json` | Não |
| Classe | `data/classes.json` (+ sprite no pacote) | Não |
| Inimigo | `data/enemies.json` | Não |
| Skill | `data/skills.json` | Não |
| Item | `data/items.json` | Não |
| Lore | `data/lore.json` | Não |

Nomes de sprite devem existir em `src/assets/dungeon/frames/` (ver
[ASSETS.md](./ASSETS.md)).
