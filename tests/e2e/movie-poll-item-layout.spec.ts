import { test, expect } from "./helpers/base";
import { LONG_CREATOR_POLL } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { overflowingElements } from "./helpers/layout";

// Layout of the movie poll item's creator line + owner edit button, against a
// poll (owned by the local user, so the edit button renders) whose item
// creators have extremely long display names.
//
// Regression guard for PR #67, which moved the edit button out of `.creator`
// into a sibling and, in condensed view, left it on the top row instead of
// below the creator's name on the card's left edge.
const WIDTHS = [320, 360, 768, 1280];
const ITEMS = [LONG_CREATOR_POLL.spaced, LONG_CREATOR_POLL.unbroken];

test.describe("movie poll item creator line", () => {
  async function openPoll(page, condensed: boolean) {
    await stubMovieApis(page);
    await signInAsLocalUser(page);
    await page.addInitScript((value) => {
      localStorage.setItem("condensed_poll_view", JSON.stringify(value));
    }, condensed);
    await page.goto(`/poll/${LONG_CREATOR_POLL.id}`);
    await expect(page.locator("movie-poll-item")).toHaveCount(ITEMS.length, { timeout: 20_000 });
  }

  test("condensed view: the edit button sits below the creator name", async ({ page }) => {
    await openPoll(page, true);

    for (const item of ITEMS) {
      const card = page.locator("movie-poll-item", { hasText: item.title });
      await expect(card.locator("mat-card.condensed-view")).toBeVisible();
      const name = await card.locator(".creator .truncate").boundingBox();
      const button = await card.locator("button.poll-item-menu-button").boundingBox();
      expect(name, `${item.title}: creator name visible`).not.toBeNull();
      expect(button, `${item.title}: edit button visible`).not.toBeNull();

      // Below: the button's top edge is at (or past) the name's bottom edge.
      expect(button!.y, `${item.title}: button below name`).toBeGreaterThanOrEqual(name!.y + name!.height - 2);
      // ...and in the same column (horizontal ranges overlap), not off to the side.
      expect(button!.x).toBeLessThan(name!.x + name!.width);
      expect(button!.x + button!.width).toBeGreaterThan(name!.x);
    }
  });

  test("normal view: the edit button stays in the creator row, above the title", async ({ page }) => {
    await openPoll(page, false);

    const card = page.locator("movie-poll-item", { hasText: LONG_CREATOR_POLL.spaced.title });
    await expect(card.locator("mat-card.condensed-view")).toHaveCount(0);
    const name = await card.locator(".creator .truncate").boundingBox();
    const button = await card.locator("button.poll-item-menu-button").boundingBox();
    const title = await card.locator("h1.title").boundingBox();
    // Same row as the name (vertical ranges overlap), to its right, above the title.
    expect(button!.y).toBeLessThan(name!.y + name!.height);
    expect(button!.y + button!.height).toBeGreaterThan(name!.y);
    expect(button!.x).toBeGreaterThanOrEqual(name!.x + name!.width - 2);
    expect(button!.y + button!.height).toBeLessThanOrEqual(title!.y + 2);
  });

  for (const condensed of [true, false]) {
    test(`${condensed ? "condensed" : "normal"} view: a very long creator name ellipsises with no overflow at ${WIDTHS.join("/")}px`, async ({ page }) => {
      await openPoll(page, condensed);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const label = `${condensed ? "condensed" : "normal"} @ ${width}px`;

        expect(
          await overflowingElements(page, "movie-poll-item", { ignoreClipped: true }),
          label
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          ),
          `${label}: page scrolls horizontally`
        ).toBeLessThanOrEqual(0);

        for (const item of ITEMS) {
          const card = page.locator("movie-poll-item", { hasText: item.title });
          const name = card.locator(".creator .truncate");
          // On phones the name can't fit, so it must be genuinely clipped (ellipsis
          // engaged) rather than stretching the card. (On wider screens a shorter
          // name may legitimately fit, so only the overflow checks apply there.)
          if (width <= 360) {
            const clipped = await name.evaluate((el) => ({
              overflowing: el.scrollWidth > el.clientWidth,
              ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
            }));
            expect(clipped, `${label}: ${item.title} name truncates`).toEqual({
              overflowing: true,
              ellipsis: true,
            });
          }
          // The card itself stays inside the viewport.
          const box = await card.locator("mat-card").boundingBox();
          expect(box!.x, label).toBeGreaterThanOrEqual(-1);
          expect(box!.x + box!.width, label).toBeLessThanOrEqual(width + 1);
        }
      }
    });
  }
});
