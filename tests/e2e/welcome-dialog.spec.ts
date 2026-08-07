import { test, expect } from "@playwright/test";

test.describe("welcome dialog — first-time visitor", () => {
  // Opts out of the project-wide default (tests/e2e/storageState.welcome-seen.json,
  // which every other spec relies on to avoid this dialog) to get a genuinely
  // empty localStorage, i.e. someone who has never been to the app before.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows on first load with the confirmed copy voice and skip label", async ({ page }) => {
    await page.goto("/");

    const dialog = page.getByTestId("welcome-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("director's cut");

    const skip = page.getByTestId("welcome-skip");
    await expect(skip).toContainText("Just here for the popcorn");
  });

  test("shows on any route, not just the homepage", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.getByTestId("welcome-dialog")).toBeVisible();
  });

  test("skip button dismisses the dialog, persists the flag, and does not navigate", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByTestId("welcome-dialog");
    await expect(dialog).toBeVisible();

    await page.getByTestId("welcome-skip").click();

    await expect(dialog).not.toBeVisible();
    expect(page.url()).toBe("http://localhost:4200/");

    const seen = await page.evaluate(() => localStorage.getItem("welcome_seen"));
    expect(seen).toBe("true");
  });

  test("does not show again on a later visit once skipped", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("welcome-skip").click();
    await expect(page.getByTestId("welcome-dialog")).not.toBeVisible();

    await page.reload();

    await expect(page.getByTestId("welcome-dialog")).not.toBeVisible();
  });
});

test.describe("welcome dialog — returning visitor", () => {
  // Uses the project-wide default storageState (welcome_seen already "true").
  test("does not show when the flag is already set", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("welcome-dialog")).not.toBeVisible();
  });
});
