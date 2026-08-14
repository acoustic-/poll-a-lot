import { test, expect } from "./helpers/base";
import { MAIN_POLL } from "./fixtures";

// The stats (votes/options/duration) live inside the merged poll-meta row —
// data-testid="poll-date" — alongside the date, owner, and vote-mode chip,
// since the "Densify poll header" pass folded the old standalone poll-stats
// bar into it. See avatar-stack's [max]=6 header instance for the analogous
// merge on the identity side.
test.describe("poll stats", () => {
  test("stats bar renders above the first poll item", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);

    const meta = page.getByTestId("poll-date");
    const firstItem = page.getByTestId("poll-item").first();
    await expect(meta).toBeVisible();
    await expect(firstItem).toBeVisible();

    // DOM order, not just visual position — precedes() checks meta comes before
    // firstItem in document order, which is what "above" means structurally.
    const order = await page.evaluate(
      ([metaTestId, itemTestId]) => {
        const meta = document.querySelector(`[data-testid="${metaTestId}"]`);
        const item = document.querySelector(`[data-testid="${itemTestId}"]`);
        if (!meta || !item) return null;
        // Node.compareDocumentPosition bit 4 (0x04) = target follows node.
        return !!(meta.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      ["poll-date", "poll-item"]
    );
    expect(order).toBe(true);
  });

  test("vote and option counts match the seeded fixture", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);
    const meta = page.getByTestId("poll-date");
    await expect(meta).toContainText(`${MAIN_POLL.totalVotes} vote`);
    await expect(meta).toContainText(`${MAIN_POLL.totalOptions} option`);
  });

  test("duration chip is absent for a non-movie poll", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);
    await expect(page.getByTestId("poll-duration")).toHaveCount(0);
  });
});
