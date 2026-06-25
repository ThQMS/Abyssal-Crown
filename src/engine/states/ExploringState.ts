import { HUD } from '@/ui/HUD';
import { LootSystem } from '@/items/LootSystem';
import { Particles } from '@/ui/Particles';
import { Animator } from '@/entities/Animator';
import { RENDER_TILE } from '@/engine/SpriteRegistry';
import { GameStateId, TileType } from '@/types';
import { InputAction } from '@/engine/InputManager';
import { chebyshev, manhattan } from '@/utils/MathUtils';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { Enemy } from '@/entities/Enemy';
import type { Vec2 } from '@/types';

/** Distância (Chebyshev) em que inimigos passam a perseguir o jogador. */
const AGGRO_RADIUS = 7;

/**
 * The core overworld loop: grid movement, fog-of-war rendering with the 0x72
 * tileset, interaction, and the transitions into combat / puzzles / dialogue.
 */
export class ExploringState implements GameState {
  readonly id = GameStateId.Exploring;
  private readonly game: Game;
  private readonly hud: HUD;
  private readonly particles = new Particles();
  private readonly animator = new Animator();
  private animClockMs = 0;
  private readonly unsubs: (() => void)[] = [];

  constructor(game: Game) {
    this.game = game;
    this.hud = new HUD();
    this.animator
      .add({ name: 'idle', frames: frames(4), frameTime: 160, loop: true })
      .add({ name: 'run', frames: frames(4), frameTime: 90, loop: true });
    this.animator.play('idle');
  }

  enter(): void {
    // Re-sync fog/camera in case we are resuming from combat or a puzzle.
    this.game.level.removeDeadEnemies();
    this.game.level.revealAround(this.game.player.position);
    this.unsubs.push(
      this.game.bus.on('toast', ({ text, durationMs }) => this.hud.showToast(text, durationMs)),
    );
    // Exibe mensagens acumuladas enquanto a exploração esteve coberta (ex.: subir
    // de nível durante combate ou puzzle).
    for (const t of this.game.pendingToasts) this.hud.showToast(t.text, t.durationMs);
    this.game.pendingToasts.length = 0;
  }

  exit(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }

  update(dtMs: number): void {
    this.animClockMs += dtMs;
    this.animator.update(dtMs);
    this.hud.update(dtMs);
    this.particles.update(dtMs);
    this.game.player.anim = 'idle';
    this.game.camera.follow({
      x: this.game.player.x * RENDER_TILE + RENDER_TILE / 2,
      y: this.game.player.y * RENDER_TILE + RENDER_TILE / 2,
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { level, camera } = this.game;
    ctx.fillStyle = level.theme.background;
    ctx.fillRect(0, 0, this.game.width, this.game.height);

    // Visible tile window from the camera.
    const startX = Math.floor(camera.x / RENDER_TILE) - 1;
    const startY = Math.floor(camera.y / RENDER_TILE) - 1;
    const endX = startX + Math.ceil(this.game.width / RENDER_TILE) + 2;
    const endY = startY + Math.ceil(this.game.height / RENDER_TILE) + 2;

    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        if (!level.map.inBounds(tx, ty)) continue;
        const discovered = level.fog.isDiscovered(tx, ty);
        if (!discovered) continue;
        const visible = level.fog.isVisible(tx, ty);
        this.drawTile(ctx, tx, ty);
        if (!visible) this.dimTile(ctx, tx, ty);
      }
    }

    // Entities (only when their tile is visible).
    for (const entity of level.entities) {
      if (!level.fog.isVisible(entity.x, entity.y)) continue;
      const e = entity as Partial<Enemy> & { sprite?: string; anim?: 'idle' | 'run'; facingLeft?: boolean };
      const base = typeof e.sprite === 'string' ? e.sprite : 'floor_1';
      this.drawEntitySprite(ctx, entity.x, entity.y, base, e.anim ?? 'idle', e.facingLeft ?? false);
    }

    this.drawPlayer(ctx);
    this.particles.render(ctx);
    this.drawInteractPrompt(ctx);
    this.hud.render(ctx, this.game.player, this.game.depth, this.game.level.map);
  }

  /** Mostra um aviso flutuante "[E]" quando há algo interagível ao lado. */
  private drawInteractPrompt(ctx: CanvasRenderingContext2D): void {
    const target = this.adjacentInteractable();
    if (!target) return;

    const isChest = 'contents' in target;
    if (isChest && (target as import('@/entities/Chest').Chest).opened) return;
    const label = isChest
      ? 'Abrir'
      : (target as import('@/entities/Inscription').Inscription).lore.id === 'save_shrine'
        ? 'Descansar'
        : 'Ler';

    const screen = this.tileScreen(target.x, target.y);
    const cx = screen.x + RENDER_TILE / 2;
    const bob = Math.sin(this.animClockMs / 200) * 3;
    const py = screen.y - 10 + bob;

    const text = `[E] ${label}`;
    ctx.save();
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(cx - tw / 2 - 6, py - 9, tw + 12, 18);
    ctx.strokeStyle = '#ffd86a';
    ctx.strokeRect(cx - tw / 2 - 6 + 0.5, py - 9 + 0.5, tw + 12, 18);
    ctx.fillStyle = '#ffd86a';
    ctx.fillText(text, cx, py + 1);
    ctx.restore();
  }

  /** Primeiro interagível adjacente ao jogador (mesma vizinhança de interact). */
  private adjacentInteractable(): import('@/entities/Chest').Chest | import('@/entities/Inscription').Inscription | undefined {
    const player = this.game.player;
    const candidates: Vec2[] = [
      player.position,
      { x: player.x, y: player.y - 1 },
      { x: player.x, y: player.y + 1 },
      { x: player.x - 1, y: player.y },
      { x: player.x + 1, y: player.y },
    ];
    for (const pos of candidates) {
      const target = this.game.level.interactableAt(pos.x, pos.y);
      if (target) return target;
    }
    return undefined;
  }

  handleInput(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveUp:
        this.tryMove(0, -1);
        break;
      case InputAction.MoveDown:
        this.tryMove(0, 1);
        break;
      case InputAction.MoveLeft:
        this.tryMove(-1, 0);
        break;
      case InputAction.MoveRight:
        this.tryMove(1, 0);
        break;
      case InputAction.Interact:
        this.interact();
        break;
      case InputAction.SkillTree:
        this.game.machine.push(GameStateId.LevelUp);
        break;
      case InputAction.Inventory:
        this.game.machine.push(GameStateId.Inventory);
        break;
      case InputAction.QuickItem:
        this.game.useBestConsumable();
        break;
      case InputAction.Pause:
        this.saveRun();
        break;
      case InputAction.Cancel:
        this.game.machine.push(GameStateId.Settings, { inGame: true });
        break;
      default:
        break;
    }
  }

  // --- Movement & interaction ----------------------------------------------

  private tryMove(dx: number, dy: number): void {
    const player = this.game.player;
    if (dx < 0) player.facingLeft = true;
    if (dx > 0) player.facingLeft = false;
    const nx = player.x + dx;
    const ny = player.y + dy;

    // Esbarrar num inimigo inicia o combate, puxando o bando ao redor.
    const enemy = this.game.level.enemyAt(nx, ny);
    if (enemy) {
      this.startCombat(this.gatherPack(enemy));
      return;
    }

    if (this.game.level.canWalk(nx, ny)) {
      player.moveTo(nx, ny);
      this.game.audio.play('step');
      this.game.level.revealAround(player.position);
      if (this.maybeDescend(nx, ny)) return; // novo andar: inimigos não agem
      this.stepEnemies();
    }
  }

  /** Retorna true se desceu de andar (regenerando o nível). */
  private maybeDescend(x: number, y: number): boolean {
    if (this.game.level.map.get(x, y)?.type === TileType.StairsDown) {
      this.game.descend();
      return true;
    }
    return false;
  }

  /**
   * Move cada inimigo em alcance um passo em direção ao jogador (A* +
   * linha de visão). Quem chega adjacente inicia o combate como um bando.
   */
  private stepEnemies(): void {
    const player = this.game.player;
    const level = this.game.level;
    const occupied = new Set<string>();
    for (const e of level.enemies) if (!e.dead) occupied.add(`${e.x},${e.y}`);

    const attackers: Enemy[] = [];
    for (const enemy of level.enemies) {
      if (enemy.dead) continue;

      // Já encostado: entra no combate sem se mover.
      if (manhattan(enemy.position, player.position) === 1) {
        attackers.push(enemy);
        continue;
      }
      // Fora do alcance de perseguição ou sem linha de visão: fica parado.
      if (chebyshev(enemy.position, player.position) > AGGRO_RADIUS) continue;
      if (!level.map.hasLineOfSight(enemy.position, player.position)) continue;

      const path = level.map.findPath(enemy.position, player.position);
      const next = path[1];
      if (!next) continue;
      if (next.x === player.x && next.y === player.y) {
        attackers.push(enemy);
        continue;
      }
      const key = `${next.x},${next.y}`;
      if (occupied.has(key) || !level.canWalk(next.x, next.y)) continue;

      occupied.delete(`${enemy.x},${enemy.y}`);
      enemy.facingLeft = next.x < enemy.x;
      enemy.moveTo(next.x, next.y);
      occupied.add(key);
    }

    if (attackers.length > 0) this.startCombat(attackers);
  }

  /** Junta o inimigo atacado com os demais adjacentes ao jogador (sem repetir). */
  private gatherPack(primary: Enemy): Enemy[] {
    const player = this.game.player;
    const pack = new Set<Enemy>([primary]);
    for (const enemy of this.game.level.enemies) {
      if (!enemy.dead && manhattan(enemy.position, player.position) === 1) pack.add(enemy);
    }
    return [...pack];
  }

  private interact(): void {
    const target = this.adjacentInteractable();
    if (!target) return;
    if ('contents' in target) {
      this.handleChest(target);
    } else {
      this.handleInscription(target);
    }
  }

  private handleChest(chest: import('@/entities/Chest').Chest): void {
    if (chest.opened) return;
    if (chest.locked && chest.puzzleId && !this.game.puzzles.isSolved(chest.puzzleId)) {
      this.game.machine.push(GameStateId.Puzzle, { puzzleId: chest.puzzleId, onSolved: () => this.openChest(chest) });
      return;
    }
    this.openChest(chest);
  }

  private openChest(chest: import('@/entities/Chest').Chest): void {
    // Marca o baú como aberto (troca o sprite) e rola o loot da faixa do andar,
    // levando para a tela dedicada de espólios. Baús de tesouro (>1 conteúdo)
    // rolam mais itens e raridade melhor.
    const big = chest.contents.length > 1;
    chest.open();
    const rng = this.game.rng.fork();
    const items = LootSystem.rollChestLoot(this.game.depth, big, rng);
    this.game.audio.play('pickup');
    this.game.bus.emit('LOOT_DROPPED', { items: items.map((i) => i.defId) });
    this.game.machine.push(GameStateId.Loot, {
      items,
      xp: 0,
      leveledUp: false,
      title: 'Tesouro!',
    });
  }

  private handleInscription(inscription: import('@/entities/Inscription').Inscription): void {
    if (inscription.lore.id === 'save_shrine') {
      this.restAtShrine();
      return;
    }

    if (inscription.hasPuzzle && inscription.puzzleId && !this.game.puzzles.isSolved(inscription.puzzleId)) {
      this.game.machine.push(GameStateId.Puzzle, { puzzleId: inscription.puzzleId });
      return;
    }
    inscription.read = true;
    this.game.bus.emit('lore:discovered', inscription.lore);
    this.game.machine.push(GameStateId.Dialogue, { lore: inscription.lore });
  }

  private startCombat(enemies: Enemy[]): void {
    this.game.audio.play('hit');
    this.game.machine.push(GameStateId.Combat, { enemies });
  }

  private saveRun(): void {
    this.game.saveGame();
  }

  private restAtShrine(): void {
    this.game.player.stats.hp = this.game.player.stats.maxHp;
    this.game.player.stats.mp = this.game.player.stats.maxMp;
    this.game.player.stats.mana = this.game.player.stats.maxMana;
    this.saveRun();
    this.game.bus.emit('toast', { text: 'Santuário ativado. Vida, mana e progresso restaurados.' });
  }

  // --- Rendering helpers ----------------------------------------------------

  private drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
    const tile = this.game.level.map.get(tx, ty);
    if (!tile) return;
    const theme = this.game.level.theme;
    const screen = this.tileScreen(tx, ty);

    // Rocha sólida (Void) e paredes usam o sprite de parede do bioma.
    if (tile.type === TileType.Wall || tile.type === TileType.Void) {
      this.blit(ctx, theme.wallSprite, screen.x, screen.y);
      this.tintTile(ctx, screen.x, screen.y, theme.tint);
      return;
    }

    // Chão: a variante 0..2 do tile mapeia para a paleta de chão do bioma.
    const variants = theme.floorVariants;
    const variant = variants[(tile.variant % variants.length + variants.length) % variants.length] ?? 1;
    this.blit(ctx, `floor_${variant}`, screen.x, screen.y);

    if (tile.isStairs) this.blit(ctx, 'floor_stairs', screen.x, screen.y);
    if (tile.type === TileType.Door) this.blit(ctx, 'doors_leaf_open', screen.x, screen.y);
    this.tintTile(ctx, screen.x, screen.y, theme.tint);
  }

  /** Aplica o tom (tint) do bioma sobre um tile já desenhado. */
  private tintTile(ctx: CanvasRenderingContext2D, x: number, y: number, tint: string | null): void {
    if (!tint) return;
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, RENDER_TILE, RENDER_TILE);
  }

  private dimTile(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
    const screen = this.tileScreen(tx, ty);
    ctx.fillStyle = this.game.level.theme.fogTint;
    ctx.fillRect(screen.x, screen.y, RENDER_TILE, RENDER_TILE);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const player = this.game.player;
    this.drawEntitySprite(ctx, player.x, player.y, player.sprite, 'idle', player.facingLeft);
  }

  /**
   * Resolve o frame via {@link SpriteRegistry.animation}, que cobre os três
   * padrões do pacote: `base_idle_anim_fN`, `base_anim_fN` (ex.: necromante,
   * ice_zombie) e frame estático único (`base`). Antes montávamos a string na
   * mão e sprites sem `_idle_` (necromante) ficavam invisíveis.
   */
  private drawEntitySprite(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    base: string,
    anim: 'idle' | 'run' = 'idle',
    flip = false,
  ): void {
    const set = this.game.sprites.animation(base, anim);
    let frame = set.frames.length > 0 ? set.frames[this.frameIndex(set.frames.length)] : undefined;
    if (!frame) frame = this.game.sprites.getFrame(base);
    if (!frame) return;
    const screen = this.tileScreen(tx, ty);
    const scale = RENDER_TILE / 16;
    const w = frame.width * scale;
    const h = frame.height * scale;
    // Anchor the (often taller) sprite to the bottom of the tile.
    const dx = screen.x + (RENDER_TILE - w) / 2;
    const dy = screen.y + RENDER_TILE - h;
    if (flip) {
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(frame, dx, dy, w, h);
    }
  }

  private blit(ctx: CanvasRenderingContext2D, key: string, x: number, y: number): void {
    const frame = this.game.sprites.getFrame(key);
    if (frame) {
      ctx.drawImage(frame, x, y, RENDER_TILE, RENDER_TILE);
    } else {
      ctx.fillStyle = '#15151f';
      ctx.fillRect(x, y, RENDER_TILE, RENDER_TILE);
    }
  }

  private tileScreen(tx: number, ty: number): Vec2 {
    return this.game.camera.worldToScreen({ x: tx * RENDER_TILE, y: ty * RENDER_TILE });
  }

  private frameIndex(count: number): number {
    return Math.floor(this.animClockMs / 160) % count;
  }
}

function frames(count: number) {
  return Array.from({ length: count }, (_, x) => ({ x, y: 0 }));
}
