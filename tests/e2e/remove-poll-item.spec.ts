import { test, expect } from "./helpers/base";
import { REMOVE_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { readPollItems, waitForPollItemCount } from "./helpers/firestore";

// Removing a poll item, from both places it can now be done (the card's own
// menu and the movie dialog) and under both permission cases (your own item,
// and — as poll owner — someone else's).
//
// Serial and project-scoped for the same reason add-movie-poll-item.spec.ts is:
// every test here deletes from the same seeded poll.
test.describe.serial("removing poll items", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(REMOVE_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
    await signInAsLocalUser(page);
  });

  async function openCardMenu(page, title: string) {
    const card = page.locator("movie-poll-item", { hasText: title });
    await expect(card).toBeVisible();
    await card.locator("button[mat-icon-button]").first().click();
  }

  test("the poll owner sees Remove on an item somebody else added", async ({ page }) => {
    await page.goto(`/poll/${pollId}`);
    await openCardMenu(page, REMOVE_POLL.theirs.title);
    // Before this change the menu item was gated on "I added this", so the
    // owner got Select / Hide and no way to remove another person's film.
    await expect(page.getByRole("menuitem", { name: "Remove" })).toBeVisible();
  });

  test("removing someone else's item asks in a dialog, and cancelling keeps it", async ({ page }) => {
    const before = await readPollItems(pollId);
    await page.goto(`/poll/${pollId}`);
    await openCardMenu(page, REMOVE_POLL.theirs.title);
    await page.getByRole("menuitem", { name: "Remove" }).click();

    const dialog = page.locator("confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(REMOVE_POLL.theirs.title);
    // It names who added it, so the owner knows whose suggestion this is.
    await expect(dialog).toContainText("E2E Owner");

    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("movie-poll-item")).toHaveCount(before.length);
  });

  test("confirming the dialog removes it", async ({ page }) => {
    const before = await readPollItems(pollId);
    await page.goto(`/poll/${pollId}`);
    await openCardMenu(page, REMOVE_POLL.theirs.title);
    await page.getByRole("menuitem", { name: "Remove" }).click();

    await page.locator("confirm-dialog").getByRole("button", { name: "Remove" }).click();

    await expect(page.locator("movie-poll-item")).toHaveCount(before.length - 1, { timeout: 10000 });
    await waitForPollItemCount(pollId, before.length - 1);
    await expect(page.locator("movie-poll-item", { hasText: REMOVE_POLL.theirs.title })).toHaveCount(0);
  });

  test("the movie dialog offers Remove, and it goes through the snackbar for your own item", async ({ page }) => {
    const before = await readPollItems(pollId);
    await page.goto(`/poll/${pollId}`);

    await page.locator("movie-poll-item", { hasText: REMOVE_POLL.mine.title }).first().click();
    await expect(page.locator("movie-dialog")).toBeVisible();

    await page.getByRole("button", { name: /Remove from/ }).click();

    // Own item: the lighter snackbar confirm, not the modal. The movie dialog
    // stays up until the removal goes through.
    await expect(page.locator("confirm-dialog")).toHaveCount(0);
    await page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("movie-dialog")).toHaveCount(0);

    await expect(page.locator("movie-poll-item")).toHaveCount(before.length - 1, { timeout: 10000 });
    await waitForPollItemCount(pollId, before.length - 1);
  });
});
