import { test, expect } from "./helpers/base";
import { DUELS_POLL, LOCAL_OWNER_REF, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";

// The first-time "how duels work" card. Deliberately a separate file from
// ranked-duels.spec.ts: those specs seed `duel-intro-seen` so they can go
// straight to the arena; this one is about the card itself.
const USER = { name: LOCAL_OWNER_REF.name, localUserId: LOCAL_OWNER_REF.localUserId! };

test.describe("duel intro", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    await stubMovieApis(page);
    await signInAsLocalUser(page, USER);
    await page.goto(`/poll/${scopedId(DUELS_POLL.id, testInfo.project.name)}`);
  });

  test("walks through four steps over the live arena, then is remembered", async ({ page }) => {
    await page.locator("duel-voting-bar .dvb-act").click();

    const intro = page.locator("duel-view .dv-intro");
    await expect(intro).toBeVisible({ timeout: 15000 });
    // The arena is still there underneath, dimmed.
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });

    await expect(intro).toContainText("Rank films by duelling");
    await expect(intro).toContainText("closest calls first");
    await expect(intro.locator(".dv-intro-mark")).toHaveCount(0);

    await intro.getByRole("button", { name: "Next" }).click();
    await expect(intro).toContainText("Pick your winner");
    await expect(intro.locator(".dv-intro-mark")).toHaveCount(2, { timeout: 5000 });

    await intro.getByRole("button", { name: "Next" }).click();
    await expect(intro).toContainText("Can't choose? Slipped?");
    await expect(intro.locator(".dv-intro-mark")).toHaveCount(1, { timeout: 5000 });

    await intro.getByRole("button", { name: "Next" }).click();
    await expect(intro).toContainText("How many rounds?");
    await expect(intro).toContainText(/\d+ films/);
    await expect(intro.locator(".dv-intro-mark")).toHaveCount(1, { timeout: 5000 });

    await intro.getByRole("button", { name: "Let's go" }).click();
    await expect(intro).toHaveCount(0);

    // Leave and come back: not shown again.
    await page.locator("duel-view .dv-close").click();
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("duel-view .dv-intro")).toHaveCount(0);
  });

  test("skip closes it at once", async ({ page }) => {
    await page.locator("duel-voting-bar .dvb-act").click();
    const intro = page.locator("duel-view .dv-intro");
    await expect(intro).toBeVisible({ timeout: 15000 });
    await intro.getByRole("button", { name: "Skip" }).click();
    await expect(intro).toHaveCount(0);
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible();
  });

  test("the help button brings it back", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("duel-intro-seen", "1"));
    await page.reload();
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "How duels work" }).click();
    await expect(page.locator("duel-view .dv-intro")).toBeVisible();
    await page.locator("duel-view .dv-intro").getByRole("button", { name: "Skip" }).click();
    await expect(page.locator("duel-view .dv-intro")).toHaveCount(0);
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible();
  });
});
