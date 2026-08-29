import { test, expect } from "./helpers/base";
import { MOVIE_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { failOnConsoleErrors } from "./helpers/console";
import { readPollItems } from "./helpers/firestore";

// Keyboard-driven coverage for <movie-search-input>. The input stops
// propagation of every keydown but does not preventDefault, so the native
// MatAutocompleteTrigger on the same element still gets arrow / escape keys —
// that's the behaviour these tests pin down. Selection itself is pointer-driven
// here (each <mat-option> wires (click), not the autocomplete's optionSelected),
// so the "commit" step clicks the keyboard-highlighted option.
//
// Driven through the add-movie dialog (the inline poll.component.html instance
// is unreachable for movie polls — "Add new item" routes to the dialog). Every
// test is non-mutating: it opens the movie dialog / closes the panel, then backs
// out without adding, and asserts the poll item count is unchanged.
test.describe("movie search — keyboard", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(MOVIE_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
    await signInAsLocalUser(page);
  });

  async function openSearch(page: import("@playwright/test").Page) {
    await page.goto(`/poll/${pollId}`);
    await page.getByText("Add new item").click();
    await expect(page.locator("add-movie-dialog")).toBeVisible();
    return page.getByTestId("movie-search-input-field");
  }

  test("ArrowDown moves the active option; clicking it opens the movie dialog", async ({ page }) => {
    const countBefore = (await readPollItems(pollId)).length;
    const field = await openSearch(page);

    await field.fill("in"); // fixture titles matching "in": "Inception", then "Interstellar"
    const options = page.getByTestId("movie-search-option");
    await expect(options.first()).toBeVisible({ timeout: 10000 });
    await expect(options).toHaveCount(2);

    // autoActiveFirstOption pre-highlights option 0; ArrowDown moves to option 1.
    const active = page.locator("mat-option.mat-mdc-option-active");
    await expect(active).toHaveText(/Inception/);
    await field.press("ArrowDown");
    await expect(active).toHaveText(/Interstellar/);
    await field.press("ArrowUp");
    await expect(active).toHaveText(/Inception/);
    await field.press("ArrowDown");

    await active.click();
    await expect(page.locator("movie-dialog")).toBeVisible();
    await expect(page.locator("movie-dialog")).toContainText("Interstellar");

    expect((await readPollItems(pollId)).length).toBe(countBefore);
  });

  test("Escape closes the autocomplete panel without selecting", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    const field = await openSearch(page);

    await field.fill("Inception");
    await expect(page.getByTestId("movie-search-option").first()).toBeVisible({ timeout: 10000 });

    await field.press("Escape");
    await expect(page.locator(".movie-search-panel")).toBeHidden();
    await expect(page.locator("movie-dialog")).toHaveCount(0);

    assertNoConsoleErrors();
  });
});
