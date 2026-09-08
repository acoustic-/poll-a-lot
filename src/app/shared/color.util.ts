/**
 * Framework-free colour maths shared by the movie dialog's adaptive background
 * and the Ranked Duels arena's backdrop tint. Everything here is pure and
 * covered by `color.util.spec.ts`; the browser-only ColorThief extraction lives
 * in `ImageColorService`.
 *
 * `rgbToHsl` returns hue in **degrees** (0–360) to match the movie dialog's
 * original implementation this was lifted from; `hslToRgb` takes the same.
 */

export type Rgb = [number, number, number];
export interface Hsl {
  /** Hue in degrees, 0–360. */
  h: number;
  /** Saturation, 0–1. */
  s: number;
  /** Lightness, 0–1. */
  l: number;
}

/** WCAG relative luminance (sRGB gamma-corrected), 0–1. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours, 1–21. Symmetric. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }

  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(hn + 1 / 3), channel(hn), channel(hn - 1 / 3)].map((v) =>
    Math.round(v * 255)
  ) as Rgb;
}

/**
 * A readable ink for text sitting on `bg`. The 0.179 luminance threshold and
 * the `#46464f` / `whitesmoke` defaults are carried verbatim from the movie
 * dialog's original `getContrastColor` so its look doesn't shift.
 */
export function readableInk(
  bg: Rgb,
  dark = "#46464f",
  light = "whitesmoke"
): string {
  return relativeLuminance(bg) > 0.179 ? dark : light;
}

/**
 * Nudge `color`'s lightness (keeping hue and saturation) until white/dark text
 * — whichever `against` needs — clears `min` contrast against it, or the
 * lightness rail is hit. Kept for a possible "adaptive backdrop" pass; not on
 * any hot path today.
 */
export function ensureContrast(color: Rgb, against: Rgb, min = 4.5): Rgb {
  if (contrastRatio(color, against) >= min) return color;
  const goDarker = relativeLuminance(against) > 0.5;
  const { h, s } = rgbToHsl(color);
  let l = rgbToHsl(color).l;
  for (let i = 0; i < 20; i++) {
    const candidate = hslToRgb({ h, s, l });
    if (contrastRatio(candidate, against) >= min) return candidate;
    const next = goDarker ? l - 0.05 : l + 0.05;
    if (next < 0 || next > 1) return candidate;
    l = next;
  }
  return hslToRgb({ h, s, l });
}

/**
 * The palette entry furthest from `bg` in HSL — a usable accent drawn from the
 * image itself. Distance weights hue and lightness over saturation, exactly as
 * the movie dialog's original `findBestContrast` did.
 */
export function mostContrasting(bg: Rgb, palette: readonly Rgb[]): Rgb {
  if (!palette?.length) return bg;
  const bgHsl = rgbToHsl(bg);
  return [...palette]
    .map((rgb) => ({ rgb, hsl: rgbToHsl(rgb) }))
    .sort((a, b) => hslDistance(b.hsl, bgHsl) - hslDistance(a.hsl, bgHsl))[0].rgb;
}

/**
 * The "text-safe tint": keep a colour's hue, cap its saturation, and force its
 * lightness dark. Used where a colour derived from an image has to sit *behind
 * white text* — a near-white sky becomes a deep charcoal of the same hue rather
 * than washing the text out. `relativeLuminance(toTint(any)) < 0.06` (pinned in
 * the spec), so white always clears AA on it.
 */
export function toTint(
  rgb: Rgb,
  opts: { maxS?: number; l?: number } = {}
): Rgb {
  const { maxS = 0.6, l = 0.15 } = opts;
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ h: hsl.h, s: Math.min(hsl.s, maxS), l });
}

/** `rgb(20, 26, 38)` — for a direct `color` / `background` value. */
export function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** `20 26 38` — the space-separated channels for a CSS custom property that a
 *  `rgb(var(--x) / <alpha>)` reference then adds opacity to. */
export function rgbChannels([r, g, b]: Rgb): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function hslDistance(a: Hsl, b: Hsl): number {
  const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 180;
  const ds = Math.abs(a.s - b.s);
  const dl = Math.abs(a.l - b.l);
  return dh * 2 + ds + dl * 2;
}
