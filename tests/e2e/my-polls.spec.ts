import { test, expect } from "./helpers/base";
import { signInWithGoogle } from "./helpers/auth";
import { withFirestore, readPollItems } from "./helpers/firestore";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { stubMovieApis } from "./helpers/tmdb";

// Assumes the caller is already signed in and on any page. Goes through the
// real create-poll form (the only reliable way to get a poll whose
// owner.id/pollItems satisfy firestore.rules — a bare unauthenticated write
// via the client SDK would just be denied).
async function createBasicPoll(page, name: string): Promise<string> {
  await page.goto("/add-poll");
  await page.getByRole("button", { name: "Advanced settings" }).click();
  await page.getByText("Movie poll", { exact: true }).click(); // default is moviepoll: true
  await page.getByPlaceholder("📌 Name of the poll").fill(name);
  await page.getByRole("button", { name: "Add option" }).click();
  await page.getByPlaceholder("Option 1").fill("Only Option");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/poll\//);
  return new URL(page.url()).pathname.split("/poll/")[1];
}

test.describe("My Polls", () => {
  test.beforeEach(async ({ page }) => {
    await stubMovieApis(page);
  });

  test("/manage when logged out shows the sign-in gate, not a poll list", async ({ page }) => {
    await page.goto("/manage");
    await expect(page.locator(".login-card")).toBeVisible();
    await expect(page.getByText("Only the newest 10 polls are shown")).toHaveCount(0);
  });

  test("lists only polls owned by the signed-in user", async ({ page }) => {
    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-a@example.com", name: "Owner A" });
    const pollAName = `E2E My Polls A ${Date.now()}`;
    await createBasicPoll(page, pollAName);

    // Sign out, then in again as a different Google account — /manage's own
    // query (where("owner.id","==",user.id)) is what's under test here.
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByLabel("Logout").click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Logged out!")).toBeVisible();

    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-b@example.com", name: "Owner B" });
    const pollBName = `E2E My Polls B ${Date.now()}`;
    await createBasicPoll(page, pollBName);

    await page.goto("/manage");
    // Poll B's own name also appears in the "Recent polls" section
    // (setRecentPoll), so getByText legitimately matches twice — .first() is
    // enough to confirm it's visible somewhere on the page.
    await expect(page.getByText(pollBName).first()).toBeVisible();
    await expect(page.getByText(pollAName)).toHaveCount(0);
  });

  test("clicking a poll row navigates to /poll/:id", async ({ page }) => {
    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-nav@example.com", name: "Nav Owner" });
    const name = `E2E My Polls Nav ${Date.now()}`;
    const pollId = await createBasicPoll(page, name);

    await page.goto("/manage");
    // Scoped to the main list, not just getByText(name): the same poll also
    // shows up in the "Recent polls" section (setRecentPoll writes to the same
    // users/{uid} doc), which would otherwise be a second match for the name.
    await page.locator("mat-card.poll").filter({ hasText: name }).getByRole("heading").click();

    await expect(page).toHaveURL(new RegExp(`/poll/${pollId}$`));
  });

  test("toggling favourite persists across reload", async ({ page }) => {
    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-fav@example.com", name: "Fav Owner" });
    const name = `E2E My Polls Fav ${Date.now()}`;
    await createBasicPoll(page, name);

    await page.goto("/manage");
    const row = page.locator("mat-card.poll").filter({ hasText: name });
    const favoriteButton = row.getByRole("button", { name: "Toggle favorite" });
    await favoriteButton.click();
    await expect(row.locator(".selected-icon")).toBeVisible();

    // toggleFavoritePoll's updateDoc() (user.service.ts) isn't awaited before the
    // UI updates optimistically, and users/{uid} is rules-protected (can't
    // verify via a bare unauthenticated client like the other Firestore-truth
    // checks in this file) — so confirm persistence by retrying the reload
    // itself until the write has actually settled, rather than guessing a fixed
    // delay or reading Firestore directly.
    await expect(async () => {
      await page.reload();
      await expect(page.locator("mat-card.poll").filter({ hasText: name }).locator(".selected-icon")).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test("deleting a poll removes it and its pollItems (verified via Firestore, not just the DOM)", async ({ page }) => {
    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-delete@example.com", name: "Delete Owner" });
    const name = `E2E My Polls Delete ${Date.now()}`;
    const pollId = await createBasicPoll(page, name);
    expect(await readPollItems(pollId)).toHaveLength(1);

    await page.goto("/manage");
    const row = page.locator("mat-card.poll").filter({ hasText: name });
    await row.getByRole("button", { name: "Remove poll button" }).click();

    const snack = page.getByText(`Do you want to remove poll: ${name}?`);
    await expect(snack).toBeVisible();
    // "Remove poll button" (the row's icon button, still present at this point)
    // also substring-matches getByRole(..., { name: "Remove" }) — scope to the
    // snackbar's own action button to avoid the ambiguity.
    await page.locator(".mat-mdc-snack-bar-actions").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Removed!")).toBeVisible({ timeout: 10000 });

    await withFirestore(async (db) => {
      await expect
        .poll(async () => (await getDoc(doc(db, `polls/${pollId}`))).exists(), { timeout: 10000 })
        .toBe(false);
      const itemsSnap = await getDocs(collection(db, `polls/${pollId}/pollItems`));
      expect(itemsSnap.empty).toBe(true);
    });
  });

  test("the share dialog opens for the correct poll", async ({ page }) => {
    await page.goto("/manage");
    await signInWithGoogle(page, { email: "mypolls-share@example.com", name: "Share Owner" });
    const name = `E2E My Polls Share ${Date.now()}`;
    await createBasicPoll(page, name);

    await page.goto("/manage");
    const row = page.locator("mat-card.poll").filter({ hasText: name });
    await row.getByRole("button", { name: "Share poll button" }).click();

    await expect(page.locator(".poll-title")).toHaveText(name);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  });
});
