/**
 * Lightweight audio layer built on the Web Audio API. Sound effects are
 * synthesized procedurally (no asset files required) so the game ships tiny and
 * still has feedback. Music hooks are left as integration points.
 *
 * The AudioContext is created lazily on first user gesture to satisfy browser
 * autoplay policies.
 */
const SETTINGS_KEY = 'abyssal_crown_audio';

export class AudioManager {
  private ctx?: AudioContext;
  private masterGain?: GainNode;
  private muted = false;
  private volume = 0.6;

  constructor() {
    this.loadSettings();
  }

  /** Volume geral atual (0..1). */
  get level(): number {
    return this.volume;
  }

  /** True se o áudio está mudo. */
  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture (click / keypress) to unlock audio. */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.masterGain && !this.muted) this.masterGain.gain.value = this.volume;
    this.saveSettings();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.saveSettings();
    return this.muted;
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { volume?: number; muted?: boolean };
      if (typeof data.volume === 'number') this.volume = Math.min(1, Math.max(0, data.volume));
      if (typeof data.muted === 'boolean') this.muted = data.muted;
    } catch {
      /* ignore */
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  /** A short blip. `type` chooses a small palette of synthesized voices. */
  play(type: 'hit' | 'cast' | 'step' | 'pickup' | 'success' | 'error' | 'menu'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const preset = PRESETS[type];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = preset.wave;
    osc.frequency.setValueAtTime(preset.freq, now);
    if (preset.sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(preset.sweepTo, now + preset.duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + preset.duration + 0.02);
  }
}

interface Preset {
  wave: OscillatorType;
  freq: number;
  sweepTo?: number;
  duration: number;
  gain: number;
}

const PRESETS: Record<string, Preset> = {
  hit: { wave: 'square', freq: 180, sweepTo: 60, duration: 0.16, gain: 0.4 },
  cast: { wave: 'sine', freq: 420, sweepTo: 880, duration: 0.25, gain: 0.3 },
  step: { wave: 'triangle', freq: 140, duration: 0.06, gain: 0.15 },
  pickup: { wave: 'sine', freq: 660, sweepTo: 990, duration: 0.18, gain: 0.3 },
  success: { wave: 'sine', freq: 523, sweepTo: 1046, duration: 0.4, gain: 0.35 },
  error: { wave: 'sawtooth', freq: 200, sweepTo: 90, duration: 0.3, gain: 0.3 },
  menu: { wave: 'triangle', freq: 330, duration: 0.08, gain: 0.2 },
};
