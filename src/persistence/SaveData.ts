import type { EquipmentSlotName, FloorProgress, ItemInstance, MinionSave, Stats } from '@/types';

/** Versao atual do esquema de save. Incremente ao mudar {@link SaveData}. */
export const SAVE_VERSION = 2;

/**
 * Payload completo de um jogo salvo. Guarda tudo que e preciso para reconstruir
 * uma run: a classe e o nome do heroi, o andar e a SEED do calabouco (para
 * regenerar exatamente a mesma masmorra), os atributos e o progresso.
 */
export interface SaveData {
  version: number;
  /** Momento do save (epoch ms), usado por {@link SaveSystem.getTimestamp}. */
  savedAt: number;

  playerClass: string;
  playerName: string;
  currentFloor: number;
  /** Posição do jogador no andar, para retomar onde parou (opcional em saves antigos). */
  playerX?: number;
  playerY?: number;
  /** Semente do gerador, para regenerar o mesmo calabouco. */
  dungeonSeed: number;

  /** Stats efetivos (inclui pools atuais de HP/MP e bônus de equipamento). */
  stats: Stats;
  /** Stats intrínsecos, sem equipamento (fonte para recomputar os efetivos). */
  baseStats: Stats;
  unlockedSkills: string[];
  equippedSkills: string[];
  /** Pontos de habilidade ainda não gastos. */
  skillPoints: number;
  /** Itens não equipados, como instâncias (raridade/afixos). */
  inventory: ItemInstance[];
  /** Itens equipados por slot. */
  equipped: Partial<Record<EquipmentSlotName, ItemInstance>>;
  /** Aliados invocados vivos (esqueletos), que persistem entre combates. */
  minions: MinionSave[];
  /** Progresso do andar atual (inimigos, baús, névoa). Ausente em saves antigos. */
  floorProgress?: FloorProgress;
  puzzlesSolved: string[];
  enemiesDefeated: number;
  totalPlaytime: number;
}

/** Campos obrigatorios usados na validacao de um save carregado. */
const REQUIRED_ARRAYS: (keyof SaveData)[] = [
  'unlockedSkills',
  'equippedSkills',
  'inventory',
  'puzzlesSolved',
];

/**
 * Valida (com narrowing) um objeto desconhecido como {@link SaveData} da versao
 * atual. Retorna false para dados corrompidos ou de outra versao.
 */
export function isValidSave(raw: unknown): raw is SaveData {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Partial<SaveData>;

  if (data.version !== SAVE_VERSION) return false;
  if (typeof data.playerClass !== 'string') return false;
  if (typeof data.currentFloor !== 'number') return false;
  if (typeof data.dungeonSeed !== 'number') return false;
  if (!data.stats || typeof data.stats !== 'object') return false;
  if (!data.baseStats || typeof data.baseStats !== 'object') return false;
  if (!data.equipped || typeof data.equipped !== 'object') return false;

  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(data[key])) return false;
  }
  return true;
}

/**
 * Aceita um save válido da versão atual ou migra um save da v1 (inventário de
 * ids simples, sem equipamento) para o formato atual. Retorna `null` para dados
 * corrompidos ou de versão desconhecida.
 */
export function migrateSave(raw: unknown): SaveData | null {
  if (isValidSave(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, unknown>;
  if (data.version === 1) return migrateV1(data);
  return null;
}

/** Converte um save v1 (inventory: string[], sem equipamento) para v2. */
function migrateV1(data: Record<string, unknown>): SaveData | null {
  if (typeof data.playerClass !== 'string') return null;
  if (typeof data.currentFloor !== 'number') return null;
  if (typeof data.dungeonSeed !== 'number') return null;
  if (!data.stats || typeof data.stats !== 'object') return null;

  const stats = data.stats as Stats;
  const oldInventory = Array.isArray(data.inventory) ? (data.inventory as string[]) : [];
  const inventory: ItemInstance[] = oldInventory.map((id, i) => ({
    uid: `${id}#mig${i}`,
    defId: id,
    rarity: 'common',
    affixes: {},
  }));

  return {
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    playerClass: data.playerClass,
    playerName: typeof data.playerName === 'string' ? data.playerName : 'Herói',
    currentFloor: data.currentFloor,
    dungeonSeed: data.dungeonSeed,
    stats,
    baseStats: { ...stats }, // v1 não tinha equipamento: base == efetivo
    unlockedSkills: asStrings(data.unlockedSkills),
    equippedSkills: asStrings(data.equippedSkills),
    skillPoints: typeof data.skillPoints === 'number' ? data.skillPoints : 0,
    inventory,
    equipped: {},
    minions: [],
    puzzlesSolved: asStrings(data.puzzlesSolved),
    enemiesDefeated: typeof data.enemiesDefeated === 'number' ? data.enemiesDefeated : 0,
    totalPlaytime: typeof data.totalPlaytime === 'number' ? data.totalPlaytime : 0,
  };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === 'string') as string[]) : [];
}
