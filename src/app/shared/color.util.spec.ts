import {
  Rgb,
  contrastRatio,
  ensureContrast,
  hslToRgb,
  mostContrasting,
  readableInk,
  relativeLuminance,
  rgbChannels,
  rgbToHsl,
  toTint,
} from "./color.util";

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

describe("color.util", () => {
  describe("relativeLuminance", () => {
    it("is 0 for black and 1 for white", () => {
      expect(relativeLuminance(BLACK)).toBe(0);
      expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    });

    it("weights green far above blue", () => {
      expect(relativeLuminance([0, 255, 0])).toBeGreaterThan(
        relativeLuminance([0, 0, 255])
      );
    });
  });

  describe("contrastRatio", () => {
    it("is 21:1 for black on white and symmetric", () => {
      expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
      expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 1);
    });

    it("is 1:1 for a colour against itself", () => {
      expect(contrastRatio([123, 45, 200], [123, 45, 200])).toBe(1);
    });
  });

  describe("rgbToHsl / hslToRgb", () => {
    it("round-trips primary colours", () => {
      for (const rgb of [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [128, 64, 32],
        [10, 10, 10],
      ] as Rgb[]) {
        const back = hslToRgb(rgbToHsl(rgb));
        expect(back[0]).toBeCloseTo(rgb[0], -0.5);
        expect(back[1]).toBeCloseTo(rgb[1], -0.5);
        expect(back[2]).toBeCloseTo(rgb[2], -0.5);
      }
    });

    it("returns hue in degrees", () => {
      expect(rgbToHsl([255, 0, 0]).h).toBe(0);
      expect(rgbToHsl([0, 255, 0]).h).toBe(120);
      expect(rgbToHsl([0, 0, 255]).h).toBe(240);
    });

    it("wraps and clamps a stray hue", () => {
      expect(hslToRgb({ h: 360, s: 1, l: 0.5 })).toEqual(hslToRgb({ h: 0, s: 1, l: 0.5 }));
      expect(hslToRgb({ h: -120, s: 1, l: 0.5 })).toEqual(hslToRgb({ h: 240, s: 1, l: 0.5 }));
    });
  });

  describe("readableInk", () => {
    it("returns dark ink on a light ground and light ink on a dark one", () => {
      expect(readableInk([240, 240, 240])).toBe("#46464f");
      expect(readableInk([20, 20, 30])).toBe("whitesmoke");
    });

    it("honours custom ink values", () => {
      expect(readableInk([10, 10, 10], "#000", "#fff")).toBe("#fff");
    });
  });

  describe("toTint", () => {
    it("keeps the hue but forces the result dark enough for white text", () => {
      // A pale desert cream — the Interstellar case that made the raw wash fail.
      const cream: Rgb = [227, 202, 185];
      const tint = toTint(cream);
      // Hue is approximately preserved — an 8-bit round-trip at L≈0.15 quantises
      // to small integers so a few degrees of drift is expected.
      expect(Math.abs(rgbToHsl(tint).h - rgbToHsl(cream).h)).toBeLessThan(8);
      expect(contrastRatio(WHITE, tint)).toBeGreaterThan(4.5);
    });

    it("clamps luminance below 0.06 for ANY input (white text is always safe)", () => {
      const samples: Rgb[] = [
        [255, 255, 255],
        [255, 255, 0],
        [255, 44, 136],
        [0, 255, 255],
        [190, 240, 190],
        [128, 128, 128],
        [0, 0, 0],
      ];
      for (const rgb of samples) {
        expect(relativeLuminance(toTint(rgb))).toBeLessThan(0.06);
      }
    });

    it("respects an override lightness / saturation cap", () => {
      const lifted = toTint([255, 0, 0], { l: 0.4, maxS: 0.3 });
      expect(rgbToHsl(lifted).l).toBeCloseTo(0.4, 1);
      // maxS is applied before the RGB conversion; the 8-bit round-trip can
      // reconstruct a hair over, so allow a small quantisation margin.
      expect(rgbToHsl(lifted).s).toBeLessThanOrEqual(0.32);
    });
  });

  describe("ensureContrast", () => {
    it("leaves a colour that already passes untouched", () => {
      const c: Rgb = [10, 10, 10];
      expect(ensureContrast(c, WHITE, 4.5)).toEqual(c);
    });

    it("darkens a mid colour until white-ground text passes", () => {
      const out = ensureContrast([120, 120, 120], WHITE, 4.5);
      expect(contrastRatio(out, WHITE)).toBeGreaterThanOrEqual(4.5);
    });

    it("lightens against a dark ground", () => {
      const out = ensureContrast([90, 90, 90], BLACK, 4.5);
      expect(contrastRatio(out, BLACK)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("mostContrasting", () => {
    it("returns the palette entry furthest from the background in HSL", () => {
      const bg: Rgb = [10, 10, 40];
      const palette: Rgb[] = [
        [12, 12, 44],
        [250, 240, 100],
        [30, 30, 60],
      ];
      expect(mostContrasting(bg, palette)).toEqual([250, 240, 100]);
    });

    it("falls back to the background for an empty palette", () => {
      const bg: Rgb = [1, 2, 3];
      expect(mostContrasting(bg, [])).toEqual(bg);
    });
  });

  describe("rgbChannels", () => {
    it("renders rounded space-separated channels for a CSS custom property", () => {
      expect(rgbChannels([20.4, 26.9, 38])).toBe("20 27 38");
    });
  });
});
