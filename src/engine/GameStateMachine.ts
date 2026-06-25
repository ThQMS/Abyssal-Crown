import type { GameStateName } from '@/types';
import type { InputActionName } from '@/engine/InputManager';
import type { EventBus } from '@/engine/EventBus';

/**
 * Contract every game state implements. States own their update/render logic and
 * react to input; the {@link GameStateMachine} only sequences them.
 */
export interface GameState {
  readonly id: GameStateName;
  /** Called when the state becomes active. `params` is transition payload. */
  enter(params?: unknown): void;
  /** Called when the state is left or covered by a pushed state. */
  exit(): void;
  update(dtMs: number): void;
  render(ctx: CanvasRenderingContext2D, alpha?: number): void;
  /** Edge-triggered input handler. */
  handleInput(action: InputActionName): void;
  /** When true the state below keeps rendering (overlay states). */
  readonly transparent?: boolean;
}

/**
 * A stack-based finite state machine. Most transitions {@link change} the top of
 * the stack; overlays (puzzle, level-up) {@link push} on top and {@link pop}
 * back, optionally letting the covered state keep drawing.
 */
export class GameStateMachine {
  private readonly states = new Map<GameStateName, GameState>();
  private readonly stack: GameState[] = [];
  private readonly bus?: EventBus;

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  register(state: GameState): this {
    this.states.set(state.id, state);
    return this;
  }

  get current(): GameState | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** Replaces the entire stack with a single state. */
  change(id: GameStateName, params?: unknown): void {
    const previous = this.current?.id ?? null;
    while (this.stack.length > 0) this.stack.pop()?.exit();
    const state = this.require(id);
    this.stack.push(state);
    state.enter(params);
    this.bus?.emit('state:change', { from: previous, to: id });
  }

  /** Replaces the stack, running a hook after exit and before enter. */
  transition(id: GameStateName, beforeEnter: () => void, params?: unknown): void {
    const previous = this.current?.id ?? null;
    while (this.stack.length > 0) this.stack.pop()?.exit();
    beforeEnter();
    const state = this.require(id);
    this.stack.push(state);
    state.enter(params);
    this.bus?.emit('state:change', { from: previous, to: id });
  }

  /** Pushes a state on top of the current one (an overlay). */
  push(id: GameStateName, params?: unknown): void {
    const previous = this.current?.id ?? null;
    this.current?.exit();
    const state = this.require(id);
    this.stack.push(state);
    state.enter(params);
    this.bus?.emit('state:change', { from: previous, to: id });
  }

  /** Pops the top state and resumes the one beneath it. */
  pop(params?: unknown): void {
    const leaving = this.stack.pop();
    leaving?.exit();
    const resumed = this.current;
    if (resumed) {
      resumed.enter(params);
      this.bus?.emit('state:change', { from: leaving?.id ?? null, to: resumed.id });
    }
  }

  update(dtMs: number): void {
    this.current?.update(dtMs);
  }

  /** Renders the stack bottom-up so transparent overlays composite correctly. */
  render(ctx: CanvasRenderingContext2D, alpha = 1): void {
    let startIndex = this.stack.length - 1;
    while (startIndex > 0 && this.stack[startIndex]?.transparent) startIndex--;
    for (let i = startIndex; i < this.stack.length; i++) {
      this.stack[i]?.render(ctx, alpha);
    }
  }

  handleInput(action: InputActionName): void {
    this.current?.handleInput(action);
  }

  private require(id: GameStateName): GameState {
    const state = this.states.get(id);
    if (!state) throw new Error(`Unknown game state: ${id}`);
    return state;
  }
}
