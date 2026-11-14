import { test, expect } from "./helpers/base";
import { VOTING_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser, signInWithGoogle } from "./helpers/auth";
import { readPollItems } from "./helpers/firestore";

// Nickname users are Firebase Anonymous Auth users since 2.0: choosing a nickname
// creates the account, a browser from before 2.0 is upgraded on its next visit, and
// signing in with Google links onto the same account so nothing they made moves.

interface StoredNickname {
  name?: string;
  anonUid?: string;
  localUserId?: string;
  legacyLocalUserIds?: string[];
}

const storedUser = (page): Promise<StoredNickname | null> =>
  page.evaluate(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

async function chooseNickname(page, nickname: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByLabel("Login").click();
  await page.getByPlaceholder("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await storedUser(page))?.anonUid).toBeTruthy();
  return (await storedUser(page))!.anonUid!;
}

test.describe("anonymous auth", () => {
  test("choosing a nickname creates an anonymous account that survives a reload", async ({ page }) => {
    const uid = await chooseNickname(page, "Nick Name");

    const stored = await storedUser(page);
    expect(stored?.name).toBe("Nick Name");
    expect(stored?.localUserId).toBeUndefined();

    await page.reload();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Logout")).toBeVisible();
    expect((await storedUser(page))?.anonUid).toBe(uid);
  });

  test("a vote by a nickname user is stored under their uid", async ({ page }, testInfo) => {
    const pollId = scopedId(VOTING_POLL.id, testInfo.project.name);
    const uid = await chooseNickname(page, "Vote Nick");
    await page.goto(`/poll/${pollId}`);

    const card = page.getByTestId("poll-item").filter({ hasText: "Option A" });
    await card.click();
    await expect(card).toHaveClass(/voted/);

    await expect
      .poll(async () => {
        const item = (await readPollItems(pollId)).find((i) => i["name"] === "Option A");
        return ((item?.["voters"] as { id?: string }[]) ?? []).some((v) => v.id === uid);
      })
      .toBe(true);

    await card.click();
    await expect(card).not.toHaveClass(/voted/);
  });

  test("a browser from before 2.0 is upgraded to an anonymous account and keeps its legacy id", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Old Timer", localUserId: "anon-legacy-1" });
    await page.goto("/");

    await expect.poll(async () => (await storedUser(page))?.anonUid).toBeTruthy();
    const stored = await storedUser(page);
    expect(stored?.name).toBe("Old Timer");
    expect(stored?.legacyLocalUserIds).toContain("anon-legacy-1");
  });

  test("logging out of a nickname account warns that it can't be recovered", async ({ page }) => {
    await chooseNickname(page, "Leaving Nick");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByLabel("Logout").click();
    await expect(page.getByText(/can't be recovered unless you sign in with Google first/)).toBeVisible();
  });

  test("a nickname user signing in with Google keeps their account and gets Google-only pages", async ({ page }) => {
    const uid = await chooseNickname(page, "Link Nick");

    await page.getByRole("button", { name: "Menu" }).click();
    await signInWithGoogle(page, { email: "link-nick-e2e@example.com", name: "Link Nick Google" }, async () => {
      await page.getByLabel("Sign in with Google").click();
    });

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Manage polls")).toBeVisible();
    await expect(page.getByLabel("Sign in with Google")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Same uid before and after: linking doesn't create a new account.
    expect((await storedUser(page))?.anonUid).toBe(uid);
    await page.goto("/add-poll");
    await expect(page.locator(".login-card")).toHaveCount(0);
  });
});
