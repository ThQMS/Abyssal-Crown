/** A simple progress callback for loading screens. */
export type ProgressCallback = (loaded: number, total: number) => void;

/**
 * Loads and caches images and JSON. Vite resolves `import.meta.glob` and asset
 * URLs at build time, so loaded assets are content-hashed and cache-friendly on
 * GitHub Pages.
 */
export class AssetLoader {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly json = new Map<string, unknown>();

  /** Loads an image once and caches it by key. */
  async loadImage(key: string, url: string): Promise<HTMLImageElement> {
    const cached = this.images.get(key);
    if (cached) return cached;
    const img = await loadImageElement(url);
    this.images.set(key, img);
    return img;
  }

  /** Fetches and caches a JSON document. */
  async loadJson<T>(key: string, url: string): Promise<T> {
    const cached = this.json.get(key);
    if (cached) return cached as T;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load JSON ${url}: ${res.status}`);
    const data = (await res.json()) as T;
    this.json.set(key, data);
    return data;
  }

  /** Loads many images, reporting progress. */
  async loadImageBatch(
    entries: { key: string; url: string }[],
    onProgress?: ProgressCallback,
  ): Promise<void> {
    let loaded = 0;
    await Promise.all(
      entries.map(async ({ key, url }) => {
        await this.loadImage(key, url);
        loaded++;
        onProgress?.(loaded, entries.length);
      }),
    );
  }

  /** Synchronously reads a previously cached image. */
  getImage(key: string): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  /** Registers an already-loaded value (e.g. statically imported JSON). */
  register<T>(key: string, value: T): void {
    this.json.set(key, value);
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${url}`));
    img.src = url;
  });
}
