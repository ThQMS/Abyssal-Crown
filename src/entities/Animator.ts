export interface AnimationFrame {
  x: number;
  y: number;
}

export interface Animation {
  name: string;
  frames: AnimationFrame[];
  frameTime: number;
  loop: boolean;
}

/** Maquina simples de animacao por frames para sprites em pixel art. */
export class Animator {
  private readonly animations = new Map<string, Animation>();
  private current?: Animation;
  private timer = 0;
  private frameIndex = 0;
  private done = false;

  add(animation: Animation): this {
    this.animations.set(animation.name, animation);
    return this;
  }

  play(name: string, force = false): void {
    const animation = this.animations.get(name);
    if (!animation) return;
    if (this.current === animation && !force) return;
    this.current = animation;
    this.frameIndex = 0;
    this.timer = 0;
    this.done = false;
  }

  update(dt: number): void {
    if (!this.current || this.done || this.current.frames.length === 0) return;

    this.timer += dt;
    while (this.timer >= this.current.frameTime) {
      this.timer -= this.current.frameTime;
      this.frameIndex++;

      if (this.frameIndex < this.current.frames.length) continue;
      if (this.current.loop) {
        this.frameIndex = 0;
      } else {
        this.frameIndex = this.current.frames.length - 1;
        this.done = true;
        break;
      }
    }
  }

  get currentFrame(): AnimationFrame {
    return this.current?.frames[this.frameIndex] ?? { x: 0, y: 0 };
  }

  get currentName(): string | undefined {
    return this.current?.name;
  }

  isDone(): boolean {
    return this.done;
  }

  /** Alias de compatibilidade com codigo existente. */
  get isFinished(): boolean {
    return this.isDone();
  }
}
