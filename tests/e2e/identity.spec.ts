import { test, expect } from "@playwright/test";
import { IDENTITY_POLL, LIVE_PROFILE } from "./fixtures";

test.describe("voter identity", () => {
  test("avatar stack overflows to +N beyond max", async ({ page }) => {
    await page.goto(`/poll/${IDENTITY_POLL.id}`);
    const stack = page.getByTestId("avatar-stack").first();
    await expect(stack).toBeVisible();
    await expect(stack.locator("user-avatar")).toHaveCount(IDENTITY_POLL.max);
    await expect(stack.locator(".overflow-chip")).toHaveText(`+${IDENTITY_POLL.overflowCount}`);
  });

  test("a voter with a live photo renders an <img>; voters without one fall back to initials", async ({ page }) => {
    await page.goto(`/poll/${IDENTITY_POLL.id}`);
    const stack = page.getByTestId("avatar-stack").first();
    // Only voter-1 (first in seed order, so guaranteed among the visible
    // max=3) has a publicProfile with a photo — the rest are frozen snapshots.
    await expect(stack.locator("img")).toHaveCount(1);
    await expect(stack.locator(".avatar.initials")).toHaveCount(IDENTITY_POLL.max - 1);
  });

  test("a live displayName override shows up instead of the frozen vote snapshot name", async ({ page }) => {
    await page.goto(`/poll/${IDENTITY_POLL.id}`);
    // The voter-filter menu chrome only renders for movie polls
    // (poll.moviepoll) — IDENTITY_POLL is flagged as one for exactly this
    // reason, even though its one item is a plain (non-movie) card.
    await page.getByLabel("Filter by voter").click();
    const voterList = page.locator(".voter-list");
    await expect(voterList).toContainText(LIVE_PROFILE.displayName);
    await expect(voterList).not.toContainText("Old Snapshot Name");
  });
});
