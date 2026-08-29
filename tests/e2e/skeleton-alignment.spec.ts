import { test, expect } from "./helpers/base";
import { CROWDED_POLL } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";

// The poll-level loading skeleton (poll.component.html #pollLoaderItem) must line
// up horizontally with the hydrated movie-poll-item cards that replace it — same
// card edges, same poster position, same text-column start — so the swap-in
// doesn't visibly shift the layout.
type Box = { left: number; right: number; top: number; width: number } | null;

async function boxes(
  page: import("@playwright/test").Page,
  selectors: Record<string, string>
): Promise<Record<string, Box>> {
  return page.evaluate((sels) => {
    const out: Record<string, Box> = {};
    for (const [key, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      if (!el) {
        out[key] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 100) / 100;
      out[key] = { left: round(r.left), right: round(r.right), top: round(r.top), width: round(r.width) };
    }
    return out;
  }, selectors);
}

test("loading skeleton lines up with the hydrated movie-poll-item", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await stubMovieApis(page);

  // Hold the Firestore Listen stream so the skeleton stays put long enough to
  // measure, then release it and measure the real cards in the same spot.
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/google.firestore.v1.Firestore/Listen/channel*", async (route) => {
    await gate;
    await route.continue();
  });

  await signInAsLocalUser(page);
  await page.goto(`/poll/${CROWDED_POLL.id}`);

  await expect(page.locator(".loading.movie-poll.max-height")).toBeVisible();
  const skeleton = await boxes(page, {
    card: '[data-testid="poll-item-loader-card"]',
    poster: '[data-testid="loader-poster"] .poster-container',
    textCol: '[data-testid="loader-text-column"]',
  });

  release();
  await expect(page.locator("movie-poll-item .option-card").first()).toBeVisible();
  await page.waitForTimeout(300);
  const real = await boxes(page, {
    card: "movie-poll-item .option-card",
    poster: "movie-poll-item poster .poster-container",
    textCol: "movie-poll-item .movie-info",
  });

  // Horizontal edges are compared as absolute viewport x (both cards sit at the
  // same left margin); vertical is compared as an offset from the card's own top
  // (the two cards are at different scroll positions on the page).
  const nearX = (key: "left" | "right", part: "card" | "poster" | "textCol", tol: number) => {
    const s = skeleton[part]?.[key] ?? NaN;
    const r = real[part]?.[key] ?? NaN;
    expect(Math.abs(s - r), `${part}.${key}: skeleton ${s} vs real ${r}`).toBeLessThanOrEqual(tol);
  };

  nearX("left", "card", 1);
  nearX("right", "card", 2);
  nearX("left", "poster", 2);
  nearX("left", "textCol", 2);

  const posterDrop = (b: Record<string, Box>) => (b.poster?.top ?? NaN) - (b.card?.top ?? NaN);
  expect(
    Math.abs(posterDrop(skeleton) - posterDrop(real)),
    `poster top offset from card: skeleton ${posterDrop(skeleton)} vs real ${posterDrop(real)}`
  ).toBeLessThanOrEqual(3);
});
