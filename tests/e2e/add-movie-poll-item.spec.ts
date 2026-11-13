import { test, expect } from "./helpers/base";
import { MOVIE_POLL, LOCKED_MOVIE_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { failOnConsoleErrors } from "./helpers/console";
import { readPollItems, waitForPollItemCount } from "./helpers/firestore";

// Direct regression coverage for D1 (docs/regression-test-plan.md): the
// import-cycle bug meant this dialog never opened and the click silently
// no-opped, with only NG0919 on the console giving it away — hence every test
// here asserts no console errors, not just the visible DOM state.
//
// Serial, not parallel: every mutating test below shares and appends to the
// same seeded poll, so each test reads the poll's *current* item count from
// Firestore rather than a hardcoded literal, and they must run in one
// worker, in order, so those reads never race a sibling test's write. That
// only orders tests within one Playwright project though — chromium and
// Mobile Chrome each get their own worker and would otherwise run this file
// concurrently against the same MOVIE_POLL doc, so `pollId` below is scoped
// per project (see fixtures.ts's scopedId and global-setup.ts's seeding).
test.describe.serial("adding movie poll items", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(MOVIE_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
  });

  test("Add new item opens the add-movie dialog with no console errors", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await expect(page.locator("add-movie-dialog")).toBeVisible();

    assertNoConsoleErrors();
  });

  test("search, select, open movie dialog, add to poll — item appears straight away", async ({ page }) => {
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);
    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length);

    await page.getByText("Add new item").click();
    await page.getByPlaceholder("🎬 Search for a movie").fill(MOVIE_POLL.searchableMovieTitle);
    const option = page.locator("mat-option", { hasText: MOVIE_POLL.searchableMovieTitle }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(page.locator("movie-dialog")).toBeVisible();
    await page.getByText(/Add movie to/).first().click();

    // No "are you sure?" step any more — the item is written on the click, and
    // the snackbar that follows offers Undo instead of asking permission.
    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length + 1, { timeout: 10000 });
    await expect(page.locator("movie-poll-item").last()).toContainText(MOVIE_POLL.searchableMovieTitle);
    await expect(page.getByText("Are you sure you want to add")).toHaveCount(0);
    await expect(page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Undo" })).toBeVisible();
    await waitForPollItemCount(pollId, itemsBefore.length + 1);
  });

  test("letting the Undo snackbar expire keeps the item", async ({ page }) => {
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await page.getByPlaceholder("🎬 Search for a movie").fill(MOVIE_POLL.thirdSearchableMovieTitle);
    const option = page.locator("mat-option", { hasText: MOVIE_POLL.thirdSearchableMovieTitle }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(page.locator("movie-dialog")).toBeVisible();
    await page.getByText(/Add movie to/).first().click();

    const undo = page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();
    // Let the 5s snackbar auto-dismiss instead of actioning it: the add stands.
    await expect(undo).not.toBeVisible({ timeout: 8000 });

    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length + 1);
    await waitForPollItemCount(pollId, itemsBefore.length + 1);
  });

  test("Undo removes the item that was just added", async ({ page }) => {
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await page.getByPlaceholder("🎬 Search for a movie").fill(MOVIE_POLL.fourthSearchableMovieTitle);
    const option = page.locator("mat-option", { hasText: MOVIE_POLL.fourthSearchableMovieTitle }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(page.locator("movie-dialog")).toBeVisible();
    await page.getByText(/Add movie to/).first().click();

    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length + 1, { timeout: 10000 });
    await page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Undo" }).click();

    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length, { timeout: 10000 });
    await waitForPollItemCount(pollId, itemsBefore.length);
  });

  test("selecting a movie already on the poll hides the Add button (duplicate guard)", async ({ page }) => {
    // The dialog is opened with filterMovies set to the poll's existing movieIds
    // (add-movie-dialog.ts's addMoviePollItem()), and movie-dialog.html's bottom
    // button container is gated on the selected movie NOT being in that list — so
    // for a movie already on the poll, "Add movie to poll" never renders at all.
    // (PollItemService.addMoviePollItem's own checkDuplicates — T4.4 — is the
    // belt-and-braces guard for any path that reaches it anyway.)
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await page.getByPlaceholder("🎬 Search for a movie").fill(MOVIE_POLL.itemTitle);
    const option = page.locator("mat-option", { hasText: MOVIE_POLL.itemTitle }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(page.locator("movie-dialog")).toBeVisible();
    await expect(page.getByText(/Add movie to/)).toHaveCount(0);
    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length);
  });

  test("adding from the Popular poster grid follows the openAnotherMovie path", async ({ page }) => {
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await expect(page.locator("add-movie-dialog")).toBeVisible();
    await page.getByText("Popular", { exact: true }).click();

    const posters = page.locator(".popular-movies poster");
    await expect(posters.first()).toBeVisible({ timeout: 10000 });
    await posters.first().click();

    await expect(page.locator("movie-dialog")).toBeVisible();
    await page.getByText(/Add movie to/).first().click();

    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length + 1, { timeout: 10000 });
    await waitForPollItemCount(pollId, itemsBefore.length + 1);
  });

  test("adding while logged out opens the login dialog and resumes after login", async ({ page }) => {
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await expect(page.locator("app-login-dialog")).toBeVisible();

    await page.getByPlaceholder("Nickname").fill("Resumed Voter");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("add-movie-dialog")).toBeVisible();
  });

  test("a locked poll has no Add new item button", async ({ page }) => {
    await signInAsLocalUser(page);
    await page.goto(`/poll/${LOCKED_MOVIE_POLL.id}`);

    await expect(page.locator("movie-poll-item")).toHaveCount(1);
    await expect(page.getByText("Add new item")).toHaveCount(0);
  });

  test("a newly added item gets order === previous item count", async ({ page }) => {
    const itemsBefore = await readPollItems(pollId);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    await page.getByText("Add new item").click();
    await page.getByPlaceholder("🎬 Search for a movie").fill(MOVIE_POLL.secondSearchableMovieTitle);
    const option = page.locator("mat-option", { hasText: MOVIE_POLL.secondSearchableMovieTitle }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
    await expect(page.locator("movie-dialog")).toBeVisible();
    await page.getByText(/Add movie to/).first().click();
    await expect(page.locator("movie-poll-item")).toHaveCount(itemsBefore.length + 1, { timeout: 10000 });

    const itemsAfter = await waitForPollItemCount(pollId, itemsBefore.length + 1);
    const newItem = itemsAfter.find((item) => !itemsBefore.some((existing) => existing["id"] === item["id"]));
    expect(newItem?.["order"]).toBe(itemsBefore.length);
  });
});
