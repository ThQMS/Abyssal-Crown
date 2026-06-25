/**
 * Sprite registry for the 0x72 DungeonTileset II asset pack.
 *
 * Vite statically resolves the glob below at build time, content-hashing every
 * frame so the bundle is cache-friendly on GitHub Pages. Frames are keyed by
 * their basename without extension (e.g. `goblin_idle_anim_f0`).
 *
 * The pack is authored on a 16×16 grid; characters occupy 16×28 cells. See
 * `docs/ASSETS.md` for credit and licensing (CC-0, by 0x72).
 */
const FRAME_URLS = import.meta.glob('@/assets/dungeon/frames/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** The native tile size of the pack, in pixels. */
export const TILE_SIZE = 16;

/** On-screen tile size (native 16px scaled ×2) used by world rendering. */
export const RENDER_TILE = 32;

/** A resolved, ready-to-draw animation: ordered frame images. */
export interface SpriteAnimation {
  frames: HTMLImageElement[];
  frameDurationMs: number;
}

export class SpriteRegistry {
  private readonly urls = new Map<string, string>();
  private readonly images = new Map<string, HTMLImageElement>();
  private loaded = false;

  constructor() {
    for (const [path, url] of Object.entries(FRAME_URLS)) {
      this.urls.set(basename(path), url);
    }
  }

  get frameCount(): number {
    return this.urls.size;
  }

  /** True once every frame image has decoded. */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Loads every frame into an HTMLImageElement. */
  async loadAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const entries = [...this.urls.entries()];
    let done = 0;
    await Promise.all(
      entries.map(async ([key, url]) => {
        this.images.set(key, await decodeImage(url));
        onProgress?.(++done, entries.length);
      }),
    );
    this.loaded = true;
  }

  /** A single decoded frame, or undefined if not loaded / unknown. */
  getFrame(key: string): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  /** True if a frame with this exact key exists in the pack. */
  has(key: string): boolean {
    return this.urls.has(key);
  }

  /** All frame keys beginning with `prefix`, in numeric frame order. */
  framesWithPrefix(prefix: string): string[] {
    return [...this.urls.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => frameIndex(a) - frameIndex(b));
  }

  /**
   * Builds a {@link SpriteAnimation} from a base name + suffix convention used
   * throughout the pack: `${base}_${anim}_anim_f0..fN`. Falls back to a single
   * static frame named `${base}` when no animation frames exist.
   */
  animation(base: string, anim: 'idle' | 'run' | 'hit' = 'idle', frameDurationMs = 140): SpriteAnimation {
    const keys = this.framesWithPrefix(`${base}_${anim}_anim_f`);
    const resolved = keys.map((k) => this.images.get(k)).filter((i): i is HTMLImageElement => !!i);
    if (resolved.length > 0) return { frames: resolved, frameDurationMs };

    // Alguns sprites do pacote não têm sufixo de estado (ex.: `necromancer_anim_fN`,
    // `ice_zombie_anim_fN`): tentamos o padrão genérico `${base}_anim_f`.
    const genericKeys = this.framesWithPrefix(`${base}_anim_f`);
    const generic = genericKeys.map((k) => this.images.get(k)).filter((i): i is HTMLImageElement => !!i);
    if (generic.length > 0) return { frames: generic, frameDurationMs };

    // Static single-frame fallback (chests, items, props).
    const single = this.images.get(base);
    return { frames: single ? [single] : [], frameDurationMs };
  }

  /** Primeiro frame "parado" de um sprite-base, com os mesmos fallbacks de {@link animation}. */
  idleFrame(base: string): HTMLImageElement | undefined {
    return this.animation(base, 'idle').frames[0];
  }
}

/** Strips directory and extension: `/a/b/goblin_f0.png` → `goblin_f0`. */
function basename(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.png$/i, '');
}

/** Extracts the trailing `_fN` index for stable frame ordering. */
function frameIndex(key: string): number {
  const match = key.match(/_f(\d+)$/);
  return match && match[1] ? parseInt(match[1], 10) : 0;
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to decode ${url}`));
    img.src = url;
  });
}
