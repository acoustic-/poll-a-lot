import { test, expect } from "./helpers/base";
import { VOTING_POLL, SINGLE_VOTE_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";

function pollItemCard(page, name: string) {
  return page.getByTestId("poll-item").filter({ hasText: name });
}

async function voteCount(page, name: string): Promise<number> {
  const text = await pollItemCard(page, name).locator(".votes span").textContent();
  return Number(text);
}

// Serial: every test votes/retracts on the same seeded polls, and reads counts
// relative to whatever the poll currently holds rather than a hardcoded literal
// — see add-movie-poll-item.spec.ts for why (the same durability/ordering
// reasoning applies here). Serial only orders tests within one project's
// worker though, so both polls are scoped per project (fixtures.ts's scopedId,
// seeded in global-setup.ts) — otherwise chromium and Mobile Chrome vote on
// the same documents concurrently and the relative counts and avatar-stack
// assertions see each other's voters.
test.describe.serial("voting", () => {
  let votingPollId: string;
  let singleVotePollId: string;

  test.beforeEach(async ({}, testInfo) => {
    votingPollId = scopedId(VOTING_POLL.id, testInfo.project.name);
    singleVotePollId = scopedId(SINGLE_VOTE_POLL.id, testInfo.project.name);
  });

  test("clicking an item votes; clicking again retracts it", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Voter One", localUserId: "voting-voter-1" });
    await page.goto(`/poll/${votingPollId}`);

    const card = pollItemCard(page, "Option A");
    const before = await voteCount(page, "Option A");

    await card.click();
    await expect.poll(() => voteCount(page, "Option A")).toBe(before + 1);
    await expect(card).toHaveClass(/voted/);
    await expect(card.getByTestId("avatar-stack").locator("user-avatar")).toHaveCount(1);

    await card.click();
    await expect.poll(() => voteCount(page, "Option A")).toBe(before);
    await expect(card).not.toHaveClass(/voted/);
  });

  test("single-vote poll: voting item B removes the vote from item A", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Voter Two", localUserId: "voting-voter-2" });
    await page.goto(`/poll/${singleVotePollId}`);

    const cardA = pollItemCard(page, "Option A");
    const cardB = pollItemCard(page, "Option B");
    const beforeA = await voteCount(page, "Option A");
    const beforeB = await voteCount(page, "Option B");

    await cardA.click();
    await expect.poll(() => voteCount(page, "Option A")).toBe(beforeA + 1);
    await expect(cardA).toHaveClass(/voted/);

    await cardB.click();
    await expect.poll(() => voteCount(page, "Option B")).toBe(beforeB + 1);
    await expect(cardB).toHaveClass(/voted/);
    await expect.poll(() => voteCount(page, "Option A")).toBe(beforeA);
    await expect(cardA).not.toHaveClass(/voted/);
  });

  test("multi-vote poll: votes on two items coexist", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Voter Three", localUserId: "voting-voter-3" });
    await page.goto(`/poll/${votingPollId}`);

    const cardA = pollItemCard(page, "Option A");
    const cardB = pollItemCard(page, "Option B");
    const beforeA = await voteCount(page, "Option A");
    const beforeB = await voteCount(page, "Option B");

    await cardA.click();
    await expect.poll(() => voteCount(page, "Option A")).toBe(beforeA + 1);
    await cardB.click();
    await expect.poll(() => voteCount(page, "Option B")).toBe(beforeB + 1);

    await expect(cardA).toHaveClass(/voted/);
    await expect(cardB).toHaveClass(/voted/);
  });

  test("voting while logged out opens the login dialog and the vote lands after login", async ({ page }) => {
    await page.goto(`/poll/${votingPollId}`);

    const card = pollItemCard(page, "Option A");
    const before = await voteCount(page, "Option A");

    await card.click();
    await expect(page.locator("app-login-dialog")).toBeVisible();
    await page.getByPlaceholder("Nickname").fill("Resumed Voter");
    await page.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => voteCount(page, "Option A")).toBe(before + 1);
    await expect(card).toHaveClass(/voted/);
  });

  test("a vote persists across reload", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Voter Four", localUserId: "voting-voter-4" });
    await page.goto(`/poll/${votingPollId}`);

    const card = pollItemCard(page, "Option B");
    const before = await voteCount(page, "Option B");
    await card.click();
    await expect.poll(() => voteCount(page, "Option B")).toBe(before + 1);

    await page.reload();
    await expect.poll(() => voteCount(page, "Option B")).toBe(before + 1);
    await expect(pollItemCard(page, "Option B")).toHaveClass(/voted/);
  });

  test("the header's vote total updates after voting", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Voter Five", localUserId: "voting-voter-5" });
    await page.goto(`/poll/${votingPollId}`);

    const meta = page.getByTestId("poll-date");
    const beforeText = await meta.textContent();
    const beforeTotal = Number(beforeText.match(/(\d+)\s+vote/)?.[1]);

    await pollItemCard(page, "Option A").click();

    await expect.poll(async () => {
      const text = await meta.textContent();
      return Number(text.match(/(\d+)\s+vote/)?.[1]);
    }).toBe(beforeTotal + 1);
  });
});
