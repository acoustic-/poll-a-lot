import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/base";
import { CROWDED_POLL } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";

// Direct regression coverage for D2 (avatar-stack overflow) and D3 (stale/
// overflowing loading skeleton), docs/regression-test-plan.md section 3.3 T3.7.
// Shared probe from the plan: any element (inside `rootSelector`) whose box
// extends past the viewport's right edge or before its left edge.
async function overflowingElements(page: Page, rootSelector = "body"): Promise<string[]> {
  return page.evaluate((sel) => {
    const docW = document.documentElement.clientWidth;
    return [...document.querySelectorAll(`${sel} *`)]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.right > docW + 1 || r.left < -1))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${el.className} [${Math.round(r.left)}..${Math.round(r.right)}] vs ${docW}`);
  }, rootSelector);
}

async function boundingBoxInside(page: Page, childSelector: string, containerSelector: string): Promise<void> {
  const child = await page.locator(childSelector).boundingBox();
  const container = await page.locator(containerSelector).boundingBox();
  expect(child, `${childSelector} should be visible`).not.toBeNull();
  expect(container, `${containerSelector} should be visible`).not.toBeNull();
  expect(child!.x).toBeGreaterThanOrEqual(container!.x - 1);
  expect(child!.x + child!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
}

test.describe("Layout / overflow", () => {
  test("participant avatar stack does not overflow the header control row at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await stubMovieApis(page);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${CROWDED_POLL.id}`);

    await expect(page.locator(".point-voting-participants avatar-stack")).toBeVisible();
    expect(await overflowingElements(page)).toEqual([]);
    await boundingBoxInside(page, ".point-voting-participants avatar-stack", ".view-toggle-container");
  });

  test("participant avatar stack never overflows across 320/360/768/1280px", async ({ page }) => {
    await stubMovieApis(page);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${CROWDED_POLL.id}`);

    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      // Let the ResizeObserver-driven autoFit settle before probing.
      await page.waitForTimeout(150);
      expect(await overflowingElements(page), `at ${width}px`).toEqual([]);
      await boundingBoxInside(page, ".point-voting-participants avatar-stack", ".view-toggle-container");
    }
  });

  test("per-item avatar stack does not overflow with a high vote count", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await stubMovieApis(page);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${CROWDED_POLL.id}`);

    const item = page.locator("movie-poll-item").first();
    await expect(item).toBeVisible();
    expect(await overflowingElements(page, "movie-poll-item")).toEqual([]);
    await boundingBoxInside(page, "movie-poll-item avatar-stack", "movie-poll-item .controls");
  });

  for (const width of [360, 1280]) {
    test(`loading skeleton has no overflowing elements at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      // Delay Firestore's Listen stream so the loading skeleton stays on
      // screen long enough to probe it deterministically, instead of racing
      // real data arriving.
      await page.route("**/google.firestore.v1.Firestore/Listen/channel*", async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
      });
      await signInAsLocalUser(page);
      await page.goto(`/poll/${CROWDED_POLL.id}`);

      await expect(page.locator(".loading.movie-poll.max-height")).toBeVisible();
      expect(await overflowingElements(page)).toEqual([]);
    });
  }

  test("loading skeleton item keeps the same poster/text/actions shape as the real item", async ({ page }) => {
    await page.route("**/google.firestore.v1.Firestore/Listen/channel*", async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await signInAsLocalUser(page);
    await page.goto(`/poll/${CROWDED_POLL.id}`);

    const card = page.locator('[data-testid="poll-item-loader-card"]').first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="loader-poster"]')).toBeVisible();
    await expect(card.locator('[data-testid="loader-text-column"]')).toBeVisible();
    await expect(card.locator('[data-testid="loader-actions-column"]')).toBeVisible();
  });
});
