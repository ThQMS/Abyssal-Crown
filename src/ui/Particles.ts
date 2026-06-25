import { withAlpha } from '@/utils/ColorUtils';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  text?: string;
}

/**
 * A minimal screen-space particle system used for hit sparks, floating damage
 * numbers and ambient motes. Coordinates are canvas pixels.
 */
export class Particles {
  private readonly particles: Particle[] = [];

  /** Emits a burst of `count` sparks from a point. */
  burst(x: number, y: number, color: string, count = 12): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        size: 2 + Math.random() * 2,
        color,
      });
    }
  }

  /** A rising, fading damage / status number. */
  floatingText(x: number, y: number, text: string, color: string): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -30,
      life: 1.1,
      maxLife: 1.1,
      size: 14,
      color,
      text,
    });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // light gravity
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.text) {
        ctx.font = `bold ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = withAlpha(p.color, alpha);
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = withAlpha(p.color, alpha);
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
  }

  clear(): void {
    this.particles.length = 0;
  }

  get count(): number {
    return this.particles.length;
  }
}
