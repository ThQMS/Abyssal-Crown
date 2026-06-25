import type { Vec2 } from '@/types';

/** Logical actions the game reacts to, decoupled from physical keys. */
export const InputAction = {
  MoveUp: 'move_up',
  MoveDown: 'move_down',
  MoveLeft: 'move_left',
  MoveRight: 'move_right',
  Confirm: 'confirm',
  Cancel: 'cancel',
  Interact: 'interact',
  Inventory: 'inventory',
  QuickItem: 'quick_item',
  SkillTree: 'skill_tree',
  Pause: 'pause',
} as const;
export type InputActionName = (typeof InputAction)[keyof typeof InputAction];

const DEFAULT_BINDINGS: Record<string, InputActionName> = {
  ArrowUp: InputAction.MoveUp,
  KeyW: InputAction.MoveUp,
  ArrowDown: InputAction.MoveDown,
  KeyS: InputAction.MoveDown,
  ArrowLeft: InputAction.MoveLeft,
  KeyA: InputAction.MoveLeft,
  ArrowRight: InputAction.MoveRight,
  KeyD: InputAction.MoveRight,
  Enter: InputAction.Confirm,
  Space: InputAction.Confirm,
  Escape: InputAction.Cancel,
  KeyE: InputAction.Interact,
  KeyI: InputAction.Inventory,
  KeyQ: InputAction.QuickItem,
  KeyK: InputAction.SkillTree,
  KeyP: InputAction.Pause,
};

const BROWSER_BLOCKED_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

/**
 * Centralizes keyboard and pointer input. States poll {@link consumePressed}
 * for edge-triggered actions or subscribe via {@link onAction}.
 */
export class InputManager {
  private readonly bindings: Record<string, InputActionName>;
  private readonly keys = new Set<string>();
  private readonly justPressed = new Set<string>();
  private readonly justReleased = new Set<string>();
  private readonly held = new Set<InputActionName>();
  private readonly pressedQueue: InputActionName[] = [];
  private readonly listeners = new Set<(action: InputActionName) => void>();
  private mousePos: Vec2 = { x: 0, y: 0 };
  private mouseClicked = false;
  private pointerDown = false;
  private attached = false;

  constructor(bindings: Record<string, InputActionName> = DEFAULT_BINDINGS) {
    this.bindings = { ...bindings };
  }

  /** Begins listening on the given canvas (and window for keys). */
  attach(canvas: HTMLCanvasElement): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas = canvas;
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas?.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas?.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas?.removeEventListener('pointerup', this.handlePointerUp);
  }

  private canvas?: HTMLCanvasElement;

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.justReleased.has(code);
  }

  wasClicked(): boolean {
    return this.mouseClicked;
  }

  getMousePos(): Vec2 {
    return { ...this.mousePos };
  }

  /** Clears edge-triggered input after the frame has consumed it. */
  flush(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    this.mouseClicked = false;
    this.pressedQueue.length = 0;
  }

  isHeld(action: InputActionName): boolean {
    return this.held.has(action);
  }

  get pointerPosition(): Vec2 {
    return this.getMousePos();
  }

  get isPointerDown(): boolean {
    return this.pointerDown;
  }

  /** Subscribes to edge-triggered actions. Returns an unsubscribe fn. */
  onAction(listener: (action: InputActionName) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drains and returns all actions pressed since the last call. */
  consumePressed(): InputActionName[] {
    const out = [...this.pressedQueue];
    this.pressedQueue.length = 0;
    return out;
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (BROWSER_BLOCKED_CODES.has(e.code) && !isEditable(e.target)) {
      e.preventDefault();
    }

    const action = this.bindings[e.code];
    // Don't hijack typing into form fields (the arcane terminal).
    if (isEditable(e.target)) return;
    const isFirstPress = !this.keys.has(e.code);
    this.keys.add(e.code);

    if (isFirstPress) this.justPressed.add(e.code);
    if (!action) return;

    if (!this.held.has(action)) {
      this.pressedQueue.push(action);
      for (const l of this.listeners) l(action);
    }
    this.held.add(action);
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    if (BROWSER_BLOCKED_CODES.has(e.code) && !isEditable(e.target)) {
      e.preventDefault();
    }

    const action = this.bindings[e.code];
    if (this.keys.delete(e.code)) this.justReleased.add(e.code);
    if (action) this.held.delete(action);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    this.updateMousePos(e);
  };

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.updateMousePos(e);
    this.pointerDown = true;
    this.mouseClicked = true;
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    this.updateMousePos(e);
    this.pointerDown = false;
  };

  private updateMousePos(e: PointerEvent): void {
    const canvas = this.canvas ?? (e.target instanceof HTMLCanvasElement ? e.target : undefined);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    this.mousePos = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
