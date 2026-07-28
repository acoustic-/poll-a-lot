import { test, expect } from "@playwright/test";
import { MAIN_POLL } from "./fixtures";

test.describe("poll stats", () => {
  test("stats bar renders above the first poll item", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);

    const stats = page.getByTestId("poll-stats");
    const firstItem = page.getByTestId("poll-item").first();
    await expect(stats).toBeVisible();
    await expect(firstItem).toBeVisible();

    // DOM order, not just visual position — precedes() checks stats comes before
    // firstItem in document order, which is what "above" means structurally.
    const order = await page.evaluate(
      ([statsTestId, itemTestId]) => {
        const stats = document.querySelector(`[data-testid="${statsTestId}"]`);
        const item = document.querySelector(`[data-testid="${itemTestId}"]`);
        if (!stats || !item) return null;
        // Node.compareDocumentPosition bit 4 (0x04) = target follows node.
        return !!(stats.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      ["poll-stats", "poll-item"]
    );
    expect(order).toBe(true);
  });

  test("vote and option counts match the seeded fixture", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);
    const stats = page.getByTestId("poll-stats");
    await expect(stats).toContainText(`${MAIN_POLL.totalVotes} vote`);
    await expect(stats).toContainText(`${MAIN_POLL.totalOptions} option`);
  });

  test("duration chip is absent for a non-movie poll", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);
    await expect(page.getByTestId("poll-stats").locator(".total-duration")).toHaveCount(0);
  });
});
