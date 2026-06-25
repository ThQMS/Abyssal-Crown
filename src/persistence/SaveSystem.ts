import { SAVE_VERSION, migrateSave, type SaveData } from '@/persistence/SaveData';

/** Chave unica no localStorage (inclui a versao para isolar saves antigos). */
const STORAGE_KEY = 'abyssal_crown_v1';

/**
 * Persistencia em `localStorage` numa unica chave. Todo acesso e defensivo: um
 * save ausente, corrompido ou de outra versao simplesmente vira `null`, nunca
 * lanca excecao.
 */
export class SaveSystem {
  private readonly available: boolean;

  constructor() {
    this.available = detectStorage();
  }

  /** True quando a persistencia esta disponivel (modo anonimo pode bloquear). */
  get isAvailable(): boolean {
    return this.available;
  }

  /** Serializa e grava o save. Carimba a versao e o horario. Retorna sucesso. */
  save(data: SaveData): boolean {
    if (!this.available) return false;
    try {
      const payload: SaveData = { ...data, version: SAVE_VERSION, savedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /** Le e valida o save. Retorna `null` se ausente, corrompido ou de outra versao. */
  load(): SaveData | null {
    if (!this.available) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return migrateSave(parsed);
    } catch {
      return null;
    }
  }

  /** True se existe um save valido. */
  hasSave(): boolean {
    return this.load() !== null;
  }

  /** Alias mantido para chamadas existentes. */
  has(): boolean {
    return this.hasSave();
  }

  /** Remove o save do armazenamento. */
  delete(): void {
    if (!this.available) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Horario do ultimo save, ou `null` se nao houver save valido. */
  getTimestamp(): Date | null {
    const save = this.load();
    if (!save || typeof save.savedAt !== 'number') return null;
    return new Date(save.savedAt);
  }
}

function detectStorage(): boolean {
  try {
    const probe = '__ac_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
