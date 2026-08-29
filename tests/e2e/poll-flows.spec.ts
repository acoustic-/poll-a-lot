import { test, expect } from "./helpers/base";
import { MAIN_POLL, OWNER_LOCAL_POLL } from "./fixtures";
import { signInAsLocalUser, signInWithGoogle } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { withFirestore } from "./helpers/firestore";
import { doc, getDoc } from "firebase/firestore";

// Light coverage for a few owner/share flows that had no e2e before.
test.describe("poll flows", () => {
  test("Share button opens the share dialog with a copy-link control", async ({ page }) => {
    await stubMovieApis(page);
    await page.goto(`/poll/${MAIN_POLL.id}`);

    await page.getByLabel("Share poll button").click();
    await expect(page.locator("app-share-dialog")).toBeVisible();
    await expect(page.locator("app-share-dialog")).toContainText("Copy poll link");
    await expect(page.locator("app-share-dialog poll-link-copy")).toBeVisible();
  });

  test("owner 'Pick random' surfaces an option and closing it changes nothing", async ({ page }) => {
    await stubMovieApis(page);
    await signInAsLocalUser(page);
    await page.goto(`/poll/${OWNER_LOCAL_POLL.id}`);
    await expect(page.getByTestId("poll-item").first()).toBeVisible();

    await page.getByRole("button", { name: "Poll options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Pick random" }).click();

    const dialog = page.locator("poll-option-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Option [AB]/);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    const items = await withFirestore(async (db) => {
      const a = await getDoc(doc(db, `polls/${OWNER_LOCAL_POLL.id}/pollItems/item-1`));
      const b = await getDoc(doc(db, `polls/${OWNER_LOCAL_POLL.id}/pollItems/item-2`));
      return [a.exists(), b.exists()];
    });
    expect(items).toEqual([true, true]);
  });

  test("editing a poll's name via the Edit sheet round-trips to Firestore", async ({ page }) => {
    await stubMovieApis(page);
    await page.goto("/add-poll");
    await signInWithGoogle(page, { email: "poll-flows-edit@example.com", name: "Edit Flow Owner" });

    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("Movie poll", { exact: true }).click();
    await page.getByPlaceholder("📌 Name of the poll").fill("Edit Flow Poll");
    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByPlaceholder("Option 1").fill("Only Option");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page).toHaveURL(/\/poll\//);
    const pollId = new URL(page.url()).pathname.split("/poll/")[1];

    await page.getByRole("button", { name: "Poll options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.locator("app-edit-poll-dialog")).toBeVisible();
    await page.getByPlaceholder("📌 Name of the poll").fill("Edit Flow Poll (renamed)");
    await page.getByRole("button", { name: "Update", exact: true }).click();

    await expect(page.getByTestId("poll-title")).toHaveText("Edit Flow Poll (renamed)");
    await expect
      .poll(async () =>
        withFirestore(async (db) => (await getDoc(doc(db, `polls/${pollId}`))).data()?.["name"])
      )
      .toBe("Edit Flow Poll (renamed)");
  });
});
