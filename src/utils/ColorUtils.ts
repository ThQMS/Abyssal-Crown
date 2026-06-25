import { clamp, lerp } from '@/utils/MathUtils';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parses a `#rrggbb` (or `#rgb`) hex string into an {@link RGB}. */
export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const value = parseInt(h, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

/** Formats an {@link RGB} as a `#rrggbb` string. */
export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Linearly interpolates between two hex colors. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
  });
}

/** Returns an `rgba(...)` string from a hex color and alpha (0..1). */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/** Darkens a hex color toward black by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', clamp(amount, 0, 1));
}

/** Lightens a hex color toward white by `amount` (0..1). */
export function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', clamp(amount, 0, 1));
}
