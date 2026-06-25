import { SkillTreeUI } from '@/ui/SkillTreeUI';
import { GameStateId } from '@/types';
import { InputAction } from '@/engine/InputManager';
import type { ElementName } from '@/types';
import type { GameState } from '@/engine/GameStateMachine';
import type { InputActionName } from '@/engine/InputManager';
import type { Game } from '@/engine/Game';
import type { SkillNode } from '@/combat/SkillTree';

/** Ordem das colunas (ramos) na tela. */
const ELEMENT_ORDER: ElementName[] = ['physical', 'fire', 'frost', 'poison', 'arcane', 'lightning', 'void'];
const MESSAGE_MS = 2600;

/**
 * Overlay da árvore de habilidades. Organiza as skills em colunas por elemento,
 * cada uma descendo pela ordem de pré-requisitos, e permite desbloquear e
 * equipar/desequipar os 4 slots de combate.
 */
export class LevelUpState implements GameState {
  readonly id = GameStateId.LevelUp;
  readonly transparent = true;
  private readonly game: Game;
  private readonly ui = new SkillTreeUI();
  /** Colunas por elemento; cada coluna é uma pilha vertical de skills. */
  private columns: SkillNode[][] = [];
  private selCol = 0;
  private selRow = 0;
  private message = '';
  private messageMs = 0;

  constructor(game: Game) {
    this.game = game;
  }

  enter(): void {
    this.refresh();
    this.selCol = 0;
    this.selRow = 0;
    this.message = '';
    this.messageMs = 0;
  }

  exit(): void {
    /* nothing */
  }

  update(dtMs: number): void {
    if (this.messageMs > 0) {
      this.messageMs -= dtMs;
      if (this.messageMs <= 0) this.message = '';
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ui.render(
      ctx,
      this.columns,
      this.selCol,
      this.selRow,
      this.game.skillTree.points,
      this.game.player.equippedSkills,
      this.message,
      this.game.width,
      this.game.height,
    );
  }

  handleInput(action: InputActionName): void {
    switch (action) {
      case InputAction.MoveUp:
        this.moveRow(-1);
        break;
      case InputAction.MoveDown:
        this.moveRow(1);
        break;
      case InputAction.MoveLeft:
        this.moveCol(-1);
        break;
      case InputAction.MoveRight:
        this.moveCol(1);
        break;
      case InputAction.Confirm:
        this.activate();
        break;
      case InputAction.SkillTree:
      case InputAction.Cancel:
        this.game.machine.pop();
        break;
      default:
        break;
    }
  }

  private moveCol(delta: number): void {
    if (this.columns.length === 0) return;
    this.selCol = (this.selCol + delta + this.columns.length) % this.columns.length;
    this.clampRow();
    this.game.audio.play('menu');
  }

  private moveRow(delta: number): void {
    const len = this.columns[this.selCol]?.length ?? 0;
    if (len === 0) return;
    this.selRow = (this.selRow + delta + len) % len;
    this.game.audio.play('menu');
  }

  /** Enter: desbloqueia (se disponível) ou alterna a skill nos slots de combate. */
  private activate(): void {
    const node = this.columns[this.selCol]?.[this.selRow];
    if (!node) return;

    if (node.available) {
      this.tryUnlock(node);
    } else if (node.unlocked) {
      this.toggleEquip(node);
    } else {
      this.game.audio.play('error');
      this.notify('Pré-requisitos não atendidos.');
    }
  }

  private tryUnlock(node: SkillNode): void {
    if (this.game.skillTree.unlock(node.skill.id)) {
      this.game.player.unlockSkill(node.skill.id);
      this.game.audio.play('success');
      this.notify(`${node.skill.name} desbloqueada e equipada.`);
      this.refresh();
    } else {
      this.game.audio.play('error');
      this.notify('Sem pontos de habilidade.');
    }
  }

  private toggleEquip(node: SkillNode): void {
    const result = this.game.player.toggleSkill(node.skill.id);
    if (result === 'equipped') {
      this.game.audio.play('success');
      this.notify(`${node.skill.name} equipada nos slots de combate.`);
    } else if (result === 'unequipped') {
      this.game.audio.play('menu');
      this.notify(`${node.skill.name} removida dos slots.`);
    } else if (result === 'full') {
      this.game.audio.play('error');
      this.notify('Os 4 slots estão cheios. Desequipe uma habilidade antes.');
    }
  }

  private notify(text: string): void {
    this.message = text;
    this.messageMs = MESSAGE_MS;
  }

  /** Monta as colunas por elemento, cada uma ordenada por profundidade de pré-requisito. */
  private refresh(): void {
    const nodes = this.game.skillTree.nodes();
    const byId = new Map(nodes.map((n) => [n.skill.id, n]));
    const depthCache = new Map<string, number>();

    const depthOf = (id: string, seen: Set<string>): number => {
      const cached = depthCache.get(id);
      if (cached !== undefined) return cached;
      const node = byId.get(id);
      let depth = 0;
      if (node) {
        for (const req of node.skill.requires) {
          if (seen.has(req)) continue;
          depth = Math.max(depth, depthOf(req, new Set(seen).add(req)) + 1);
        }
      }
      depthCache.set(id, depth);
      return depth;
    };

    const byElement = new Map<ElementName, SkillNode[]>();
    for (const node of nodes) {
      const list = byElement.get(node.skill.element) ?? [];
      list.push(node);
      byElement.set(node.skill.element, list);
    }

    this.columns = ELEMENT_ORDER.filter((el) => byElement.has(el)).map((el) =>
      (byElement.get(el) as SkillNode[]).sort((a, b) => {
        const da = depthOf(a.skill.id, new Set([a.skill.id]));
        const db = depthOf(b.skill.id, new Set([b.skill.id]));
        if (da !== db) return da - db;
        return a.skill.name.localeCompare(b.skill.name);
      }),
    );

    if (this.selCol >= this.columns.length) this.selCol = Math.max(0, this.columns.length - 1);
    this.clampRow();
  }

  private clampRow(): void {
    const len = this.columns[this.selCol]?.length ?? 0;
    if (this.selRow >= len) this.selRow = Math.max(0, len - 1);
  }
}
