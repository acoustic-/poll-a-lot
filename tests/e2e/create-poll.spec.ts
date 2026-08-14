import { test, expect } from "./helpers/base";
import { signInWithGoogle } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { withFirestore, readPollItems } from "./helpers/firestore";
import { doc, getDoc } from "firebase/firestore";

async function readPoll(pollId: string) {
  return withFirestore(async (db) => {
    const snap = await getDoc(doc(db, `polls/${pollId}`));
    return snap.data();
  });
}

// Each test signs in with its own distinct account and creates its own poll(s)
// — no shared/seeded fixtures — so these run safely in parallel with the rest
// of the suite (default fullyParallel:true).
test.describe("creating polls", () => {
  test("/add-poll when logged out shows the sign-in gate, not the form", async ({ page }) => {
    await page.goto("/add-poll");
    await expect(page.locator(".login-card")).toBeVisible();
    await expect(page.getByPlaceholder("📌 Name of the poll")).toHaveCount(0);
  });

  test("creating a basic (non-movie) poll redirects to /poll/:id with both options rendered", async ({ page }) => {
    await page.goto("/add-poll");
    await signInWithGoogle(page, { email: "create-basic@example.com", name: "Basic Creator" });

    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("Movie poll", { exact: true }).click(); // default is moviepoll: true — turn it off
    await page.getByPlaceholder("📌 Name of the poll").fill("E2E Created Basic Poll");

    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByPlaceholder("Option 1").fill("First Option");
    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByPlaceholder("Option 2").fill("Second Option");

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page).toHaveURL(/\/poll\//);
    await expect(page.getByTestId("poll-title")).toHaveText("E2E Created Basic Poll");
    await expect(page.getByTestId("poll-item")).toHaveCount(2);
    await expect(page.getByTestId("poll-item").filter({ hasText: "First Option" })).toBeVisible();
    await expect(page.getByTestId("poll-item").filter({ hasText: "Second Option" })).toBeVisible();
  });

  test("creating a movie poll via search stores movieId and movie metadata", async ({ page }) => {
    await stubMovieApis(page);
    await page.goto("/add-poll");
    await signInWithGoogle(page, { email: "create-movie@example.com", name: "Movie Creator" });

    await page.getByPlaceholder("📌 Name of the poll").fill("E2E Created Movie Poll");
    await page.getByPlaceholder("🎬 Search for a movie").fill("Fight Club");
    const option = page.locator("mat-option", { hasText: "Fight Club" }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(page.locator("movie-poll-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page).toHaveURL(/\/poll\/([^/]+)/);
    const pollId = new URL(page.url()).pathname.split("/poll/")[1];

    const items = await readPollItems(pollId);
    expect(items).toHaveLength(1);
    expect(items[0]["movieId"]).toBe(550);
    expect((items[0]["moviePollItemData"] as any)?.title).toBe("Fight Club");
  });

  test("poll settings round-trip: selectMultiple and description persist", async ({ page }) => {
    await page.goto("/add-poll");
    await signInWithGoogle(page, { email: "create-settings@example.com", name: "Settings Creator" });

    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("Movie poll", { exact: true }).click();
    await page.getByText("Allow voting for multiple options").click(); // default true -> off

    await page.getByPlaceholder("📌 Name of the poll").fill("E2E Settings Poll");
    await page.getByPlaceholder("📝 Poll description").fill("A description that should round-trip.");
    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByPlaceholder("Option 1").fill("Only Option");

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page).toHaveURL(/\/poll\//);
    const pollId = new URL(page.url()).pathname.split("/poll/")[1];
    const poll = await readPoll(pollId);
    expect(poll?.["selectMultiple"]).toBe(false);
    expect(poll?.["description"]).toBe("A description that should round-trip.");
    await expect(page.getByTestId("poll-description")).toContainText("A description that should round-trip.");
  });

  test("enabling ranked point voting (via Edit) stores the default budget", async ({ page }) => {
    await stubMovieApis(page);
    await page.goto("/add-poll");
    await signInWithGoogle(page, { email: "create-pointvoting@example.com", name: "Point Voting Creator" });

    // Point voting is movie-poll-only (edit-poll-dialog.component.html gates it
    // on pollTemp.moviepoll) — leave the default moviepoll:true in place, which
    // means the poll needs a movie item (not a plain "Add option" item) to save.
    await page.getByPlaceholder("📌 Name of the poll").fill("E2E Point Voting Poll");
    await page.getByPlaceholder("🎬 Search for a movie").fill("Fight Club");
    const option = page.locator("mat-option", { hasText: "Fight Club" }).first();
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
    await expect(page.locator("movie-poll-item")).toHaveCount(1);

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/poll\//);
    const pollId = new URL(page.url()).pathname.split("/poll/")[1];

    await page.getByRole("button", { name: "Poll options", exact: true }).click();
    await page.getByText("Edit", { exact: true }).click();
    await page.getByText("Ranked point voting").click();
    await page.getByRole("button", { name: "Update", exact: true }).click();

    await expect.poll(async () => (await readPoll(pollId))?.["pointVoting"]).toMatchObject({
      pointVoting: true,
      pointVotingBudget: 5,
    });
    await expect(page.locator(".point-voting-banner")).toBeVisible();
  });

  test("the created poll's owner.id is the signed-in uid", async ({ page }) => {
    await page.goto("/add-poll");
    const uid = await signInWithGoogle(page, { email: "create-owner@example.com", name: "Owner Creator" });

    await page.getByRole("button", { name: "Advanced settings" }).click();
    await page.getByText("Movie poll", { exact: true }).click();
    await page.getByPlaceholder("📌 Name of the poll").fill("E2E Owner Poll");
    await page.getByRole("button", { name: "Add option" }).click();
    await page.getByPlaceholder("Option 1").fill("Only Option");

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page).toHaveURL(/\/poll\//);
    const pollId = new URL(page.url()).pathname.split("/poll/")[1];
    const poll = await readPoll(pollId);
    expect((poll?.["owner"] as any)?.id).toBe(uid);
  });
});
