import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/base";
import { stubMovieApis } from "./helpers/tmdb";
import { overflowingElements } from "./helpers/layout";

// Part 5: the landing hero title must always render as exactly two lines,
// "Welcome home" / "movie lover! 🍿" — never one, never three, and the popcorn
// emoji must never drop onto its own line.

type LineMetrics = {
  count: number;
  rects: number[];
  tops: number[];
  bottoms: number[];
  lineHeight: number;
  titleHeight: number;
};

async function titleMetrics(page: Page): Promise<LineMetrics> {
  return page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(".title-text");
    const lines = [...document.querySelectorAll<HTMLElement>(".title-text .title-line")];
    return {
      count: lines.length,
      // How many line boxes each span occupies — >1 means the span itself wrapped.
      rects: lines.map((line) => line.getClientRects().length),
      tops: lines.map((line) => Math.round(line.getBoundingClientRect().top)),
      bottoms: lines.map((line) => Math.round(line.getBoundingClientRect().bottom)),
      lineHeight: lines[0]
        ? parseFloat(getComputedStyle(lines[0]).lineHeight) ||
          lines[0].getBoundingClientRect().height
        : 0,
      titleHeight: title ? title.getBoundingClientRect().height : 0,
    };
  });
}

const VIEWPORTS = [
  { label: "320 portrait", width: 320, height: 720 },
  { label: "360 portrait", width: 360, height: 740 },
  { label: "768 portrait", width: 768, height: 1024 },
  { label: "1280 portrait", width: 1280, height: 900 },
  { label: "1000x700 landscape", width: 1000, height: 700 },
];

test.describe("Landing hero title", () => {
  for (const vp of VIEWPORTS) {
    test(`is exactly two unwrapped lines at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubMovieApis(page);
      await page.goto("/");

      await expect(page.locator(".title-text .title-line")).toHaveCount(2);
      await expect(page.locator(".title-text .title-line").first()).toHaveText("Welcome home");
      await expect(page.locator(".title-text .title-line").nth(1)).toContainText("movie lover!");

      const m = await titleMetrics(page);
      // Neither span wrapped internally.
      expect(m.rects, `${vp.label}: each line stays on one row`).toEqual([1, 1]);
      // The two spans are stacked, not side by side.
      expect(m.tops[1], `${vp.label}: line 2 sits below line 1`).toBeGreaterThanOrEqual(m.bottoms[0] - 1);
      // Guard against a third line creeping in.
      expect(m.titleHeight, `${vp.label}: title is ~2 lines tall`).toBeLessThan(m.lineHeight * 2.6);

      // The hero must not push the page sideways. The popular-movies marquee is a
      // deliberate horizontal scroll strip, so ignore anything inside a clipped/
      // scrolled ancestor and check only genuine page-level overflow.
      expect(
        await overflowingElements(page, "body", { ignoreClipped: true }),
        vp.label
      ).toEqual([]);
    });
  }
});
