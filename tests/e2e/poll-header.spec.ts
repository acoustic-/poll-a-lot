import { test, expect } from "./helpers/base";
import { MAIN_POLL, SHORT_DESC_POLL } from "./fixtures";

test.describe("poll header", () => {
  test("shows the seeded date, not 1970 (regression for the *1000 bug)", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);
    await expect(page.getByTestId("poll-date")).toContainText(MAIN_POLL.expectedDateText);
    await expect(page.getByTestId("poll-date")).not.toContainText("1970");
  });

  test("long description clamps, shows 'Show more', and expands on click", async ({ page }) => {
    await page.goto(`/poll/${MAIN_POLL.id}`);

    const description = page.getByTestId("poll-description");
    await expect(description).toHaveClass(/clamped/);

    const toggle = page.getByTestId("poll-description-toggle");
    await expect(toggle).toHaveText("Show more");

    await toggle.click();
    await expect(description).not.toHaveClass(/clamped/);
    await expect(toggle).toHaveText("Show less");

    await toggle.click();
    await expect(description).toHaveClass(/clamped/);
    await expect(toggle).toHaveText("Show more");
  });

  test("short description shows no toggle", async ({ page }) => {
    await page.goto(`/poll/${SHORT_DESC_POLL.id}`);
    await expect(page.getByTestId("poll-description")).toBeVisible();
    await expect(page.getByTestId("poll-description-toggle")).toHaveCount(0);
  });
});
