import { EventBus } from '@/engine/EventBus';
import { InputManager } from '@/engine/InputManager';
import { Camera } from '@/engine/Camera';
import { AssetLoader } from '@/engine/AssetLoader';
import { AudioManager } from '@/engine/AudioManager';
import { SpriteRegistry, RENDER_TILE } from '@/engine/SpriteRegistry';
import { GameStateMachine } from '@/engine/GameStateMachine';

import { TitleState } from '@/engine/states/TitleState';
import { MainMenuState } from '@/engine/states/MainMenuState';
import { SettingsState } from '@/engine/states/SettingsState';
import { ExploringState } from '@/engine/states/ExploringState';
import { CombatState } from '@/engine/states/CombatState';
import { PuzzleState } from '@/engine/states/PuzzleState';
import { DialogueState } from '@/engine/states/DialogueState';
import { LevelUpState } from '@/engine/states/LevelUpState';
import { LootState } from '@/engine/states/LootState';
import { InventoryState } from '@/engine/states/InventoryState';
import { GameOverState } from '@/engine/states/GameOverState';

import { DungeonLevel } from '@/world/DungeonLevel';
import { Player } from '@/entities/Player';
import { Minion } from '@/entities/Minion';
import { SkillTree, skillsForClass } from '@/combat/SkillTree';
import { Skill } from '@/combat/Skill';
import { PuzzleSystem } from '@/puzzle/PuzzleSystem';
import { ArcaneTerminal } from '@/puzzle/ArcaneTerminal';
import { SaveSystem } from '@/persistence/SaveSystem';
import { SAVE_VERSION, type SaveData } from '@/persistence/SaveData';
import { RNG } from '@/utils/RNG';

import { GameStateId } from '@/types';
import type {
  ClassDefinition,
  EnemyDefinition,
  EquipmentSlotName,
  GameStateName,
  ItemDefinition,
  ItemInstance,
  LoreEntry,
  Point,
  PuzzleData,
  SkillDefinition,
  Stats,
} from '@/types';

import classesData from '@/data/classes.json';
import enemiesData from '@/data/enemies.json';
import skillsData from '@/data/skills.json';
import puzzlesData from '@/data/puzzles.json';
import loreData from '@/data/lore.json';
import itemsData from '@/data/items.json';

const FIXED_STEP = 1000 / 60;
const MAX_DELTA_MS = 100;
/** XP descontado ao pedir uma dica num puzzle. */
const HINT_XP_COST = 10;
/** Rotulo de slot informado nos eventos GAME_SAVED (save em chave unica). */
const STORAGE_SLOT = 'abyssal_crown_v1';

/** The static content catalogue, loaded from `src/data/*.json`. */
export interface GameData {
  classes: ClassDefinition[];
  enemies: EnemyDefinition[];
  skills: SkillDefinition[];
  puzzles: PuzzleData[];
  lore: LoreEntry[];
  items: ItemDefinition[];
}

/**
 * The root object: owns the canvas, every engine subsystem, the shared data
 * catalogue and the active run. States read from and mutate this object.
 */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly bus = EventBus;
  readonly input = new InputManager();
  readonly camera: Camera;
  readonly assets = new AssetLoader();
  readonly audio = new AudioManager();
  readonly sprites = new SpriteRegistry();
  readonly machine: GameStateMachine;
  readonly terminal: ArcaneTerminal;
  readonly saves = new SaveSystem();

  readonly data: GameData = {
    classes: classesData as ClassDefinition[],
    enemies: enemiesData as EnemyDefinition[],
    skills: skillsData as SkillDefinition[],
    puzzles: puzzlesData as unknown as PuzzleData[],
    lore: loreData as LoreEntry[],
    items: itemsData as ItemDefinition[],
  };

  // --- Active run state (populated by startNewGame / loadGame) --------------
  rng = new RNG();
  seed = 1;
  depth = 1;
  player!: Player;
  level!: DungeonLevel;
  skillTree!: SkillTree;
  puzzles!: PuzzleSystem;
  playtimeMs = 0;
  playerName = 'Herói';
  enemiesDefeated = 0;
  /** Toasts a exibir quando a exploração voltar a ser o estado ativo. */
  readonly pendingToasts: { text: string; durationMs?: number }[] = [];

  private lastFrameMs = 0;
  private accumulatorMs = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.camera = new Camera(canvas.width, canvas.height);
    this.machine = new GameStateMachine(this.bus);
    this.terminal = new ArcaneTerminal();

    this.machine
      .register(new TitleState(this))
      .register(new MainMenuState(this))
      .register(new SettingsState(this))
      .register(new ExploringState(this))
      .register(new CombatState(this))
      .register(new PuzzleState(this))
      .register(new DialogueState(this))
      .register(new LevelUpState(this))
      .register(new LootState(this))
      .register(new InventoryState(this))
      .register(new GameOverState(this));

    this.wireEvents();
  }

  /** Convenience getters for states. */
  get width(): number {
    return this.canvas.width;
  }
  get height(): number {
    return this.canvas.height;
  }

  /** Loads assets and enters the main menu. */
  async init(): Promise<void> {
    this.input.attach(this.canvas);
    this.input.onAction((action) => {
      this.audio.resume();
      this.machine.handleInput(action);
    });
    // Destrava o áudio também no clique (políticas de autoplay do navegador).
    this.canvas.addEventListener('pointerdown', () => this.audio.resume());
    await this.sprites.loadAll();
    this.transitionTo(GameStateId.Title);
    this.start();
  }

  /** Backwards-compatible alias for older bootstrap code. */
  async boot(): Promise<void> {
    await this.init();
  }

  /** Leaves the current state, resets event subscriptions, then enters a new one. */
  transitionTo(newState: GameStateName, params?: unknown): void {
    this.machine.transition(
      newState,
      () => {
        this.bus.clear();
        this.wireEvents();
      },
      params,
    );
  }

  /** Starts the requestAnimationFrame loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameMs = performance.now();
    this.accumulatorMs = 0;
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    const dtMs = Math.min(MAX_DELTA_MS, now - this.lastFrameMs);
    this.lastFrameMs = now;
    this.accumulatorMs += dtMs;

    while (this.accumulatorMs >= FIXED_STEP) {
      this.playtimeMs += FIXED_STEP;
      this.machine.update(FIXED_STEP);
      this.accumulatorMs -= FIXED_STEP;
    }

    const alpha = this.accumulatorMs / FIXED_STEP;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.machine.render(this.ctx, alpha);
    this.input.flush();

    requestAnimationFrame(this.loop);
  };

  // --- Run lifecycle --------------------------------------------------------

  /** Begins a fresh run with the chosen class. */
  startNewGame(classId: string, seed = (Math.random() * 0xffffffff) >>> 0): void {
    const klass = this.data.classes.find((c) => c.id === classId) ?? this.data.classes[0];
    if (!klass) throw new Error('No class definitions available');

    this.seed = seed;
    this.rng = new RNG(seed);
    this.depth = 1;
    this.playtimeMs = 0;
    this.enemiesDefeated = 0;
    this.playerName = klass.name;

    this.skillTree = new SkillTree(skillsForClass(this.data.skills, klass.startingSkills), klass.startingSkills);
    this.puzzles = new PuzzleSystem(this.data.puzzles, this.bus);

    this.player = new Player(0, 0, klass);
    this.generateLevel(this.depth);
    this.transitionTo(GameStateId.Exploring);
  }

  loadGame(): boolean {
    const save = this.saves.load();
    if (!save) return false;

    const klass = this.data.classes.find((c) => c.id === save.playerClass) ?? this.data.classes[0];
    if (!klass) return false;

    this.seed = save.dungeonSeed;
    this.rng = new RNG(save.dungeonSeed);
    this.depth = save.currentFloor;
    this.playtimeMs = save.totalPlaytime;
    this.enemiesDefeated = save.enemiesDefeated;
    this.playerName = save.playerName;
    this.skillTree = new SkillTree(skillsForClass(this.data.skills, klass.startingSkills), save.unlockedSkills);
    this.skillTree.points = save.skillPoints ?? 0;
    this.puzzles = new PuzzleSystem(this.data.puzzles, this.bus);
    this.puzzles.hydrate(save.puzzlesSolved);
    this.player = new Player(0, 0, klass);
    this.player.baseStats = { ...save.baseStats };
    this.player.stats = { ...save.stats };
    this.player.unlockedSkills = [...save.unlockedSkills];
    this.player.equippedSkills = [...save.equippedSkills];
    this.player.inventory = save.inventory.map(cloneInstance);
    this.player.equipment = cloneEquipment(save.equipped);
    this.player.minions = (save.minions ?? []).map(Minion.fromSave);
    this.player.puzzlesSolved = [...save.puzzlesSolved];
    this.player.recomputeStats();
    const spawn =
      typeof save.playerX === 'number' && typeof save.playerY === 'number'
        ? { x: save.playerX, y: save.playerY }
        : undefined;
    this.generateLevel(save.currentFloor, spawn);
    // Restaura o progresso do andar (inimigos derrotados, baús, névoa).
    if (save.floorProgress) this.level.restoreProgress(save.floorProgress);
    this.transitionTo(GameStateId.Exploring);
    this.bus.emit('toast', { text: 'Jogo carregado.' });
    return true;
  }

  /** Monta o snapshot de save a partir do estado atual da run. */
  buildSaveData(): SaveData {
    return {
      version: SAVE_VERSION,
      savedAt: 0,
      playerClass: this.player.classId,
      playerName: this.playerName,
      currentFloor: this.depth,
      playerX: this.player.x,
      playerY: this.player.y,
      dungeonSeed: this.seed,
      stats: { ...this.player.stats },
      baseStats: { ...this.player.baseStats },
      unlockedSkills: this.skillTree.serialize(),
      equippedSkills: [...this.player.equippedSkills],
      skillPoints: this.skillTree.points,
      inventory: this.player.inventory.map(cloneInstance),
      equipped: cloneEquipment(this.player.equipment),
      minions: this.player.minions.map((minion) => minion.toSave()),
      floorProgress: this.level?.serializeProgress(),
      puzzlesSolved: this.puzzles.serialize(),
      enemiesDefeated: this.enemiesDefeated,
      totalPlaytime: this.playtimeMs,
    };
  }

  /** Grava o save e notifica. Com `silent`, omite o toast (auto-saves). */
  saveGame(silent = false): boolean {
    const ok = this.saves.save(this.buildSaveData());
    if (ok) this.bus.emit('GAME_SAVED', { slot: STORAGE_SLOT, timestamp: Date.now() });
    if (!silent || !ok) this.bus.emit('toast', { text: ok ? 'Jogo salvo.' : 'Falha ao salvar.' });
    return ok;
  }

  /**
   * Builds and populates the level for a given depth, placing the player. Com
   * `spawn` válido (caminhável), retoma a posição salva; senão usa a entrada.
   */
  generateLevel(depth: number, spawn?: Point): void {
    this.depth = depth;
    this.level = new DungeonLevel(depth, this.rng);

    const start =
      spawn && this.level.map.isWalkable(spawn.x, spawn.y) ? spawn : this.level.entrance;
    this.player.moveTo(start.x, start.y);
    this.level.revealAround(start);
    this.camera.setWorldBounds(
      this.level.map.width * RENDER_TILE,
      this.level.map.height * RENDER_TILE,
    );
    this.camera.snapTo({ x: start.x * RENDER_TILE, y: start.y * RENDER_TILE });
  }

  /** Descends one floor (called from the stairs-down tile). Salva ao descer. */
  descend(): void {
    this.generateLevel(this.depth + 1);
    this.bus.emit('toast', { text: `Andar ${this.depth} — ${this.level.theme.name}` });
    this.saveGame(true);
  }

  /** Resolves a skill id to a runtime Skill via the catalogue. */
  resolveSkill = (id: string): Skill | undefined => {
    const def = this.data.skills.find((s) => s.id === id);
    return def ? new Skill(def) : undefined;
  };

  /** Looks up a lore entry by id. */
  loreById(id: string): LoreEntry | undefined {
    return this.data.lore.find((l) => l.id === id);
  }

  /** Looks up an item definition by id. */
  itemById(id: string): ItemDefinition | undefined {
    return this.data.items.find((i) => i.id === id);
  }

  /** A instância de consumível que `useBestConsumable` usaria agora. */
  bestConsumableInstance(): ItemInstance | undefined {
    if (!this.player) return undefined;
    return this.player.inventory.find((inst) => {
      const item = this.itemById(inst.defId);
      return item?.kind === 'consumable' && this.isUsefulConsumable(item);
    });
  }

  /** Definição do melhor consumível (para a prévia da ação "Item" no combate). */
  bestConsumable(): ItemDefinition | undefined {
    const inst = this.bestConsumableInstance();
    return inst ? this.itemById(inst.defId) : undefined;
  }

  useBestConsumable(): boolean {
    const inst = this.bestConsumableInstance();
    if (!inst) {
      this.bus.emit('toast', { text: 'Nenhum consumível útil agora.' });
      return false;
    }

    return this.useConsumable(inst);
  }

  useConsumable(instance: ItemInstance): boolean {
    const item = this.itemById(instance.defId);
    if (!item || item.kind !== 'consumable' || !item.modifiers) return false;
    if (!this.player.removeItem(instance.uid)) return false;

    this.applyItemModifiers(item.modifiers);
    this.bus.emit('toast', { text: `${item.name} usado.` });
    return true;
  }

  private wireEvents(): void {
    this.bus.on('enemy:defeated', ({ xp }) => {
      this.enemiesDefeated++;
      const levels = this.player.gainXp(xp);
      if (levels > 0) {
        this.skillTree.points += levels;
        this.bus.emit('player:levelup', { level: this.player.stats.level });
      }
    });

    // Avisa ao subir de nível. O nível sobe durante combate/puzzle (quando a
    // exploração está coberta e não escuta 'toast'), então enfileiramos a
    // mensagem para a exploração exibir assim que voltar a ser o estado ativo.
    this.bus.on('player:levelup', ({ level }) => {
      this.pendingToasts.push({
        text: `⬆ Nível ${level}! Ponto de habilidade ganho — abra a árvore (K).`,
        durationMs: 3400,
      });
    });

    this.bus.on('player:died', () => {
      this.transitionTo(GameStateId.GameOver);
    });

    // Pedir uma dica num puzzle custa um pouco de XP.
    this.bus.on('puzzle:hint', () => {
      this.player.stats.xp = Math.max(0, this.player.stats.xp - HINT_XP_COST);
    });
  }

  private isUsefulConsumable(item: ItemDefinition): boolean {
    const modifiers = item.modifiers ?? {};
    if ((modifiers.hp ?? 0) > 0 && this.player.stats.hp < this.player.stats.maxHp) return true;
    if (((modifiers.mp ?? 0) > 0 || (modifiers.mana ?? 0) > 0) && this.player.stats.mp < this.player.stats.maxMp) {
      return true;
    }
    return Object.keys(modifiers).some((key) => key.startsWith('max') || key === 'magic' || key === 'atk' || key === 'attack');
  }

  private applyItemModifiers(modifiers: Partial<Stats>): void {
    // `hp`/`mp` curam os pools atuais; os demais (maxHp, magic, atk, ...) são
    // boosts permanentes aos stats intrínsecos (recalcula os efetivos).
    const heal = modifiers.hp ?? 0;
    const mana = modifiers.mp ?? modifiers.mana ?? 0;

    this.player.boostBase(modifiers);
    if (heal > 0) this.player.heal(heal);
    if (mana > 0) this.player.restoreMp(mana);
  }
}

/** Cópia profunda de uma instância de item (para snapshots de save). */
function cloneInstance(instance: ItemInstance): ItemInstance {
  return { ...instance, affixes: { ...instance.affixes } };
}

/** Cópia profunda do mapa de equipamento por slot. */
function cloneEquipment(
  equipment: Partial<Record<EquipmentSlotName, ItemInstance>>,
): Partial<Record<EquipmentSlotName, ItemInstance>> {
  const out: Partial<Record<EquipmentSlotName, ItemInstance>> = {};
  for (const [slot, inst] of Object.entries(equipment) as [EquipmentSlotName, ItemInstance | undefined][]) {
    if (inst) out[slot] = cloneInstance(inst);
  }
  return out;
}
