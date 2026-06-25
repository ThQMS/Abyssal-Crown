/**
 * Tipos compartilhados do Abyssal Crown.
 *
 * O projeto usa `verbatimModuleSyntax` + `erasableSyntaxOnly`; por isso, os
 * "enums" sao objetos `as const` com unions derivadas, em vez de `enum` real.
 */

/** Coordenada 2D em grade ou pixels. */
export interface Point {
  x: number;
  y: number;
}

/** Compatibilidade com codigo existente que usa Vec2. */
export type Vec2 = Point;

/** Retangulo alinhado aos eixos em grade ou pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dimensao em grade ou pixels. */
export interface Size {
  width: number;
  height: number;
}

/** Direcoes cardeais de movimento. */
export const Direction = {
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
} as const;
export type DirectionName = (typeof Direction)[keyof typeof Direction];

/** Tipos de tile que compoem um andar da masmorra. */
export const TileType = {
  /** Rocha solida nao escavada — o preenchimento inicial do mapa. */
  Void: 'void',
  Wall: 'wall',
  Floor: 'floor',
  Door: 'door',
  StairsDown: 'stairs_down',
  StairsUp: 'stairs_up',
  Water: 'water',
  Rubble: 'rubble',
} as const;
export type TileTypeName = (typeof TileType)[keyof typeof TileType];

/** Estado da nevoa de guerra para cada celula. */
export const FogState = {
  Hidden: 'hidden',
  Explored: 'explored',
  Revealed: 'revealed',
  Visible: 'visible',
} as const;
export type FogStateName = (typeof FogState)[keyof typeof FogState];

/** Categorias de sala geradas no calabouco. */
export const RoomType = {
  Normal: 'normal',
  Elite: 'elite',
  Start: 'start',
  Puzzle: 'puzzle',
  Treasure: 'treasure',
  Boss: 'boss',
  Exit: 'exit',
  Combat: 'combat',
  Shrine: 'shrine',
  Empty: 'empty',
} as const;
export type RoomTypeName = (typeof RoomType)[keyof typeof RoomType];

/** Elementos de dano e afinidade usados pelo combate. */
export const Element = {
  Physical: 'physical',
  Fire: 'fire',
  Frost: 'frost',
  Poison: 'poison',
  Lightning: 'lightning',
  Arcane: 'arcane',
  Void: 'void',
} as const;
export type ElementName = (typeof Element)[keyof typeof Element];

/** Efeitos de status temporarios aplicados em combate. */
export const StatusEffectType = {
  Burn: 'burn',
  Burning: 'burning',
  Empowered: 'empowered',
  Freeze: 'freeze',
  Shock: 'shock',
  Poison: 'poison',
  Regen: 'regen',
  Shield: 'shield',
  Weaken: 'weaken',
  Bleed: 'bleed',
  Stun: 'stun',
} as const;
export type StatusEffectTypeName = (typeof StatusEffectType)[keyof typeof StatusEffectType];

/** Tipos de puzzle que o jogo pode apresentar. */
export const PuzzleType = {
  Code: 'code',
  Logic: 'logic',
  Cipher: 'cipher',
  Pattern: 'pattern',
} as const;
export type PuzzleTypeName = (typeof PuzzleType)[keyof typeof PuzzleType];

/** Compatibilidade com codigo existente que usa PuzzleKind. */
export const PuzzleKind = PuzzleType;
export type PuzzleKindName = PuzzleTypeName;

/** Linguagens aceitas nos puzzles de codigo. */
export const PuzzleLanguage = {
  JavaScript: 'js',
  TypeScript: 'ts',
  Python: 'python',
  /** JS ou Python, a escolha do jogador no terminal. */
  Both: 'both',
  PseudoCode: 'pseudocode',
  None: 'none',
} as const;
export type PuzzleLanguageName = (typeof PuzzleLanguage)[keyof typeof PuzzleLanguage];

/** Classes jogaveis disponiveis. */
export const ClassId = {
  Knight: 'knight',
  Archmage: 'archmage',
  Paladin: 'paladin',
  Necromancer: 'necromancer',
} as const;
export type ClassIdName = (typeof ClassId)[keyof typeof ClassId];

/** Estados de alto nivel controlados pela GameStateMachine. */
export const GameStateId = {
  Title: 'title',
  MainMenu: 'main_menu',
  Settings: 'settings',
  Exploring: 'exploring',
  Combat: 'combat',
  Puzzle: 'puzzle',
  Dialogue: 'dialogue',
  LevelUp: 'level_up',
  Loot: 'loot',
  Inventory: 'inventory',
  GameOver: 'game_over',
} as const;
export type GameStateName = (typeof GameStateId)[keyof typeof GameStateId];

/** Raridade de um item; afeta cor, número de afixos e magnitude rolada. */
export const Rarity = {
  Common: 'common',
  Rare: 'rare',
  Epic: 'epic',
} as const;
export type RarityName = (typeof Rarity)[keyof typeof Rarity];

/** Slots de equipamento do herói. */
export const EquipmentSlot = {
  Weapon: 'weapon',
  Armor: 'armor',
  Accessory: 'accessory',
} as const;
export type EquipmentSlotName = (typeof EquipmentSlot)[keyof typeof EquipmentSlot];

/**
 * Instância concreta de um item no inventário. Equipamentos rolam `affixes`
 * (bônus aleatórios somados aos `modifiers` da definição); consumíveis têm
 * raridade comum e nenhum afixo.
 */
export interface ItemInstance {
  /** Id único da instância (ex.: `weapon_axe#7`). */
  uid: string;
  /** Aponta para uma {@link ItemDefinition} em items.json. */
  defId: string;
  rarity: RarityName;
  /** Bônus rolados no drop (só equipamento). */
  affixes: Partial<Stats>;
}

/** Estatisticas mutaveis de combate de uma criatura. */
export interface Stats {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  level: number;
  xp: number;
  xpToNext: number;

  /** Aliases usados pelo codigo e dados atuais. */
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  magic: number;
  resistance: number;
  speed: number;
}

/** Multiplicadores por elemento (1 = neutro, <1 = resistente, >1 = vulneravel). */
export type Affinities = Partial<Record<ElementName, number>>;

/** Resultado consolidado de dano para logs, UI e eventos. */
export interface DamageResult {
  damage: number;
  isCrit: boolean;
  elementMultiplier: number;
  statusApplied?: ActiveStatusEffect;
  killingBlow: boolean;
}

/** Efeito de status ativo em uma entidade. */
export interface ActiveStatusEffect {
  type: StatusEffectTypeName;
  turnsRemaining: number;
  power: number;
}

/** Dados serializaveis de uma habilidade. */
export interface SkillData {
  id: string;
  name: string;
  description: string;
  tier: number;
  treeId: string;
  power: number;
  element: ElementName;
  manaCost: number;
  penetration: number;
  statusChance: number;
  statusType?: StatusEffectTypeName;
  buffSelf?: Partial<Stats>;
  healPercent?: number;
  cooldown: number;
  spriteFrame: string;
}

/** Caso de teste de um puzzle de codigo. */
export interface TestCase {
  input: unknown;
  expected: unknown;
  description: string;
}

export interface PuzzleReward {
  xp: number;
  /** Item unico concedido (ou null quando nao ha). */
  itemId?: string | null;
  items?: string[];
  skills?: string[];
}

/** Definicao completa de um puzzle exibido ao jogador. */
export interface PuzzleData {
  id: string;
  floor: number;
  required: boolean;
  title: string;
  lore: string;
  type: PuzzleTypeName;
  language: PuzzleLanguageName;
  curriculum: string;
  difficulty: number;
  description: string;
  starterCode: string;
  testCases: TestCase[];
  hint: string;
  reward: PuzzleReward;
}

/** Resultado da tentativa de um puzzle. */
export interface PuzzleResult {
  success?: boolean;
  attempts?: number;
  penalty?: number;
  timeSeconds?: number;

  /** Campos usados pela implementacao atual dos puzzles. */
  solved: boolean;
  message: string;
  details?: string[];
}

/** Contrato comum de um estado de jogo. */
export interface IGameState {
  enter(): void;
  update(deltaMs: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  exit(): void;
}

/** Payloads tipados emitidos pelo barramento de eventos do jogo. */
export interface GameEvents {
  COMBAT_START: { enemyIds: string[] };
  COMBAT_END: { victory: boolean; xpGained: number };
  ENEMY_DIED: { enemyId: string; xp: number };
  PLAYER_HURT: { amount: number; element: ElementName };
  PUZZLE_START: { puzzleId: string };
  PUZZLE_SOLVED: { puzzleId: string; result: PuzzleResult };
  PUZZLE_FAILED: { puzzleId: string; result?: PuzzleResult };
  LEVEL_COMPLETE: { floor: number; nextFloor?: number };
  SKILL_UNLOCKED: { skillId: string; skill?: SkillData };
  ITEM_COLLECTED: { itemId: string; quantity?: number };
  LOOT_DROPPED: { items: string[]; enemyId?: string; position?: Point };
  PLAYER_DIED: undefined;
  GAME_SAVED: { slot: string; timestamp: number };

  /** Eventos legados usados pelo codigo atual. */
  'state:change': { from: GameStateName | null; to: GameStateName };
  'player:moved': Point;
  'player:damaged': { amount: number; element: ElementName };
  'player:died': undefined;
  'player:levelup': { level: number };
  'enemy:defeated': { enemyId: string; xp: number };
  'combat:start': { enemyIds: string[] };
  'combat:end': { victory: boolean };
  'combat:hit': { targetId: number; amount: number; element: ElementName; crit: boolean; heal?: boolean };
  'puzzle:start': { puzzleId: string };
  'puzzle:solved': { puzzleId: string; result: PuzzleResult };
  'puzzle:hint': { puzzleId: string };
  'lore:discovered': LoreEntry;
  'save:written': { slot: string };
  toast: { text: string; durationMs?: number };
}

/** Uma definicao vinda de `data/classes.json`. */
export interface ClassDefinition {
  id: ClassIdName | string;
  name: string;
  description: string;
  lore?: string;
  element?: ElementName;
  /** Nome-base do sprite no pacote 0x72 (ex.: `knight_m`, `wizzard_f`). */
  sprite: string;
  baseStats: Stats;
  hpPerLevel?: number;
  manaPerLevel?: number;
  atkPerLevel?: number;
  defPerLevel?: number;
  skillTrees?: string[];
  /** Incrementos aplicados a cada subida de nivel. */
  growth: Partial<Stats>;
  startingSkills: string[];
}

/** Uma definicao vinda de `data/enemies.json`. */
export interface EnemyDefinition {
  id: string;
  name: string;
  glyph: string;
  color: string;
  /** Nome-base do sprite no pacote 0x72 (ex.: `goblin`, `big_demon`). */
  sprite: string;
  stats: Stats;
  affinities: Affinities;
  skills: string[];
  xpReward: number;
  /** Chave do perfil de IA consumido por EnemyAI. */
  behavior: string;
  loot?: string[];
}

/** Uma definicao vinda de `data/skills.json`. */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  element: ElementName;
  mpCost: number;
  power: number;
  penetration?: number;
  statusChance?: number;
  statusType?: StatusEffectTypeName;
  healPercent?: number;
  /** Quantidade de tiles que a habilidade alcanca. */
  range: number;
  /** Quando true, cura/fortalece o conjurador em vez de causar dano. */
  support?: boolean;
  /** Turnos de recarga apos o uso (0 = sempre disponivel). */
  cooldown?: number;
  /** Efeitos aplicados ao acertar. */
  applies?: StatusEffectSpec[];
  /** Habilidades que precisam estar desbloqueadas antes desta. */
  requires?: string[];
  /** Quando presente, a habilidade invoca um aliado em vez de causar dano. */
  summon?: SummonSpec;
  tier: number;
}

/** Parâmetros de um aliado invocado por uma habilidade. */
export interface SummonSpec {
  name: string;
  /** Nome-base do sprite no pacote 0x72 (ex.: `skelet`). */
  sprite: string;
  hp: number;
  attack: number;
  /** Quantos aliados invoca (padrão 1). */
  count?: number;
}

/** Estado serializável de um aliado invocado (persiste entre combates/saves). */
export interface MinionSave {
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  attack: number;
}

/**
 * Progresso mutável de um andar, para retomar onde parou. O layout é
 * determinístico por andar, então identificamos inimigos pela chave de spawn
 * (`"x,y"`) e baús pela posição.
 */
export interface FloorProgress {
  /** Chaves de spawn dos inimigos ainda VIVOS (os ausentes foram derrotados). */
  livingEnemies: string[];
  /** Posições (`"x,y"`) dos baús já abertos. */
  openedChests: string[];
  /** Névoa descoberta, como string base64 do mapa de tiles. */
  discovered: string;
}

/** Descricao serializavel de um efeito de status a aplicar. */
export interface StatusEffectSpec {
  id: string;
  duration: number;
  magnitude: number;
}

/** Uma definicao vinda de `data/items.json`. */
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  kind: 'consumable' | 'weapon' | 'armor' | 'relic' | 'key';
  /** Frame estatico do sprite no pacote 0x72 (ex.: `flask_red`). */
  sprite: string;
  value: number;
  modifiers?: Partial<Stats>;
  /** Faixa de poder (1-3), usada pelas tabelas de loot por andar. */
  tier?: number;
}

/** Uma definicao vinda de `data/puzzles.json`. */
export interface PuzzleDefinition {
  id: string;
  kind: PuzzleKindName;
  title: string;
  prompt: string;
  /** Payload livre, interpretado conforme o tipo de puzzle. */
  spec: Record<string, unknown>;
  reward: PuzzleReward;
  difficulty: number;
}

/** Entrada individual de lore vinda de `data/lore.json`. */
export interface LoreEntry {
  id: string;
  title: string;
  body: string;
  /** Narrador opcional para lore em formato de dialogo. */
  speaker?: string;
}

/** Payload principal de save. Veja `persistence/SaveData.ts`. */
export interface GameProgress {
  classId: string;
  depth: number;
  stats: Stats;
  unlockedSkills: string[];
  inventory: string[];
  solvedPuzzles: string[];
  discoveredLore: string[];
  seed: number;
  playtimeMs: number;
}
