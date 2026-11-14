import { test, expect } from "./helpers/base";
import { NON_OWNER_REMOVE_POLL, LOCKED_OWNED_REMOVE_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { readPollItems, waitForPollItemCount } from "./helpers/firestore";

// The permission cases remove-poll-item.spec.ts (poll owner viewing) doesn't
// reach: a viewer who is NOT the poll owner, and a locked poll.
//
// Serial: the first test deletes from the non-owner poll the others read.
test.describe.serial("remove permissions", () => {
  test.beforeEach(async ({ page }) => {
    await stubMovieApis(page);
    await signInAsLocalUser(page);
  });

  const dialogRemoveButton = (page) => page.getByRole("button", { name: /Remove from/ });

  test("a non-owner can neither see Remove in the dialog nor the menu for an item someone else added", async ({ page }, testInfo) => {
    const pollId = scopedId(NON_OWNER_REMOVE_POLL.id, testInfo.project.name);
    await page.goto(`/poll/${pollId}`);
    const card = page.locator("movie-poll-item", { hasText: NON_OWNER_REMOVE_POLL.theirs.title });
    await expect(card).toBeVisible();

    // (The positive control for "the Remove button can render at all" is the
    // next test, where this same viewer sees it on their own item.
    // NOTE: the card menu can't serve as that control for a local sign-in user —
    // it gates on `creator.id === user.id`, which a local user never has.)
    // No edit menu at all on an item that isn't yours, when you don't own the poll.
    await expect(card.locator("button.poll-item-menu-button")).toHaveCount(0);

    await card.click();
    await expect(page.locator("movie-dialog")).toBeVisible();
    await expect(dialogRemoveButton(page)).toHaveCount(0);
  });

  test("a non-owner who added an item can remove it from the dialog", async ({ page }, testInfo) => {
    const pollId = scopedId(NON_OWNER_REMOVE_POLL.id, testInfo.project.name);
    const before = await readPollItems(pollId);
    await page.goto(`/poll/${pollId}`);

    await page.locator("movie-poll-item", { hasText: NON_OWNER_REMOVE_POLL.mine.title }).first().click();
    await expect(page.locator("movie-dialog")).toBeVisible();
    await dialogRemoveButton(page).click();

    // Their own item → the lighter snackbar, not the modal. The movie dialog
    // stays up until the removal is confirmed and the card is gone.
    await expect(page.locator("confirm-dialog")).toHaveCount(0);
    await page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("movie-dialog")).toHaveCount(0);

    await waitForPollItemCount(pollId, before.length - 1);
    await expect(page.locator("movie-poll-item", { hasText: NON_OWNER_REMOVE_POLL.mine.title })).toHaveCount(0);
  });

  test("the dialog offers no Remove on a locked poll, even to its owner", async ({ page }, testInfo) => {
    const pollId = scopedId(LOCKED_OWNED_REMOVE_POLL.id, testInfo.project.name);
    await page.goto(`/poll/${pollId}`);

    await page.locator("movie-poll-item", { hasText: LOCKED_OWNED_REMOVE_POLL.mine.title }).first().click();
    await expect(page.locator("movie-dialog")).toBeVisible();
    await expect(dialogRemoveButton(page)).toHaveCount(0);
  });
});
