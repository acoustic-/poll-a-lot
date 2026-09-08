import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import ColorThief from "colorthief";
import { Rgb, mostContrasting, readableInk } from "./color.util";

// colorthief@2.7.0 ships types for the Node build's static Promise API, but
// bundlers resolve its "module" field (the older synchronous class API) for the
// browser. See the same note that used to live in movie-dialog.ts.
interface ColorThiefBrowserInstance {
  getColor(sourceImage: HTMLImageElement, quality?: number): Rgb;
  getPalette(
    sourceImage: HTMLImageElement,
    colorCount?: number,
    quality?: number
  ): Rgb[];
}
type ColorThiefBrowserCtor = new () => ColorThiefBrowserInstance;

export interface ImageColors {
  /** ColorThief's single dominant colour for the image. */
  dominant: Rgb;
  /** Up to eight representative colours. */
  palette: Rgb[];
  /** The palette entry furthest from `dominant` in HSL — a usable accent. */
  complementary: Rgb;
  /** Readable ink for text placed ON `dominant` (`#46464f` or `whitesmoke`). */
  ink: string;
}

// What SSR and any extraction failure resolve to — a muted near-neutral so the
// consuming surface has something sane to composite over until (or if) real
// colours arrive on the client.
const NEUTRAL: ImageColors = {
  dominant: [46, 40, 58],
  palette: [[46, 40, 58]],
  complementary: [46, 40, 58],
  ink: "whitesmoke",
};

/**
 * One place to pull a colour palette out of a remote image. Caches by URL for
 * the process lifetime (`providedIn: "root"`), so the movie dialog and the
 * Ranked Duels arena share a single ColorThief pass per distinct backdrop.
 *
 * The maths (`mostContrasting`, `readableInk`, contrast, HSL) is the pure,
 * unit-tested `color.util`; this service is only the browser plumbing —
 * fetch-to-blob (a bare cross-origin `img.src` taints the canvas and
 * `getImageData` throws), the `<img>` load, and the cache.
 */
@Injectable({ providedIn: "root" })
export class ImageColorService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, Promise<ImageColors>>();

  /**
   * Dominant + palette + complementary + ink for `url`, cached per URL. Resolves
   * to a neutral (never rejects) during SSR or on any extraction failure, so
   * callers can treat it as always-succeeding.
   */
  colors(url: string | null | undefined): Promise<ImageColors> {
    if (!url || !this.isBrowser) return Promise.resolve(NEUTRAL);
    let pending = this.cache.get(url);
    if (!pending) {
      pending = this.extract(url).catch(() => NEUTRAL);
      this.cache.set(url, pending);
    }
    return pending;
  }

  /** Just the dominant colour — what a tinted backdrop needs for its scrim. */
  dominant(url: string | null | undefined): Promise<Rgb> {
    return this.colors(url).then((c) => c.dominant);
  }

  private async extract(url: string): Promise<ImageColors> {
    const img = await this.loadImage(url);
    const thief = new (ColorThief as unknown as ColorThiefBrowserCtor)();
    const dominant = thief.getColor(img);
    const palette = thief.getPalette(img) ?? [dominant];
    return {
      dominant,
      palette,
      complementary: mostContrasting(dominant, palette),
      ink: readableInk(dominant),
    };
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return fetch(url)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(objectUrl);
              resolve(img);
            };
            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error(`ImageColorService: failed to load ${url}`));
            };
            img.src = objectUrl;
          })
      );
  }
}
