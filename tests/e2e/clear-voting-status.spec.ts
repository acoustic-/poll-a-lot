import { test, expect } from "./helpers/base";
import {
  CLEAR_VOTES_POLL,
  CLEAR_VOTES_POINTS_POLL,
  LOCAL_OWNER_REF,
  SEEN_LABEL,
  seedMoviePollItemData,
  scopedId,
} from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { readPollItems, withFirestore } from "./helpers/firestore";
import { doc, setDoc } from "firebase/firestore";

// Reset a poll's items to a known votes + "Seen" reaction state before each test,
// so the destructive "Clear voting status" flow is isolated regardless of order
// (pollItems are `write: if true`, so the bare client SDK can do this).
async function seedItems(
  pollId: string,
  items: readonly { id: string; movieId: number; title: string }[],
  otherVoter: { id: string; name: string },
  opts: { points?: boolean } = {}
): Promise<void> {
  await withFirestore(async (db) => {
    for (const [order, item] of items.entries()) {
      await setDoc(doc(db, `polls/${pollId}/pollItems/${item.id}`), {
        id: item.id,
        pollId,
        name: item.title,
        created: Date.now().toString(),
        order,
        movieId: item.movieId,
        moviePollItemData: seedMoviePollItemData(item.movieId, item.title),
        voters: [
          { id: otherVoter.id, name: otherVoter.name, timestamp: Date.now(), ...(opts.points ? { points: 2 } : {}) },
          { ...LOCAL_OWNER_REF, timestamp: Date.now(), ...(opts.points ? { points: 1 } : {}) },
        ],
        reactions: [{ label: SEEN_LABEL, users: [{ id: otherVoter.id, name: otherVoter.name }] }],
      });
    }
  });
}

function seenUsers(item: Record<string, unknown>): unknown[] {
  const reactions = (item["reactions"] as { label: string; users: unknown[] }[]) ?? [];
  return reactions.find((r) => r.label === SEEN_LABEL)?.users ?? [];
}

async function openClearVotingStatus(page: import("@playwright/test").Page, pollId: string) {
  await signInAsLocalUser(page);
  await page.goto(`/poll/${pollId}`);
  await expect(page.locator("movie-poll-item").first()).toBeVisible();
  await page.getByRole("button", { name: "Poll options", exact: true }).click();
  await page.getByTestId("poll-clear-voting-status").click();
  await expect(page.locator("confirm-dialog")).toBeVisible();
}

// Serial: every test here re-seeds and then mutates the same per-project poll,
// and Playwright's fullyParallel would otherwise let them race each other.
test.describe.serial("clear voting status — plain movie poll", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(CLEAR_VOTES_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
    await seedItems(pollId, CLEAR_VOTES_POLL.items, {
      id: CLEAR_VOTES_POLL.otherVoterId,
      name: CLEAR_VOTES_POLL.otherVoterName,
    });
  });

  test("Cancel on the first dialog leaves votes and reactions untouched", async ({ page }) => {
    await openClearVotingStatus(page, pollId);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("confirm-dialog")).toHaveCount(0);

    const items = await readPollItems(pollId);
    for (const item of items) {
      expect((item["voters"] as unknown[]).length).toBe(2);
      expect(seenUsers(item).length).toBe(1);
    }
  });

  test("Clear votes + leave Seen empties voters but keeps the Seen reaction", async ({ page }) => {
    await openClearVotingStatus(page, pollId);
    await page.getByRole("button", { name: "Clear votes" }).click();

    await expect(page.locator("confirm-dialog")).toContainText("Seen");
    await page.getByRole("button", { name: "Leave them" }).click();

    await expect.poll(async () => (await readPollItems(pollId)).every((i) => (i["voters"] as unknown[]).length === 0)).toBe(true);
    for (const item of await readPollItems(pollId)) {
      expect(seenUsers(item).length).toBe(1);
    }
  });

  test("Clear votes + clear Seen empties both", async ({ page }) => {
    await openClearVotingStatus(page, pollId);
    await page.getByRole("button", { name: "Clear votes" }).click();
    await page.getByRole("button", { name: "Clear seen reactions" }).click();

    await expect.poll(async () => {
      const items = await readPollItems(pollId);
      return items.every((i) => (i["voters"] as unknown[]).length === 0 && seenUsers(i).length === 0);
    }).toBe(true);
  });
});

test.describe.serial("clear voting status — point voting", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(CLEAR_VOTES_POINTS_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
    await seedItems(
      pollId,
      CLEAR_VOTES_POINTS_POLL.items,
      { id: CLEAR_VOTES_POINTS_POLL.otherVoterId, name: CLEAR_VOTES_POINTS_POLL.otherVoterName },
      { points: true }
    );
  });

  test("'Keep votes, zero points only' keeps membership and zeroes points", async ({ page }) => {
    await openClearVotingStatus(page, pollId);
    await page.getByRole("button", { name: "Keep votes, zero points only" }).click();
    // Seen dialog still appears (useSeenReaction is on) — leave them.
    await page.getByRole("button", { name: "Leave them" }).click();

    await expect.poll(async () => {
      const items = await readPollItems(pollId);
      return items.every(
        (i) =>
          (i["voters"] as { points?: number }[]).length === 2 &&
          (i["voters"] as { points?: number }[]).every((v) => (v.points ?? 0) === 0)
      );
    }).toBe(true);
  });

  test("'Remove all votes' empties voters", async ({ page }) => {
    await openClearVotingStatus(page, pollId);
    await page.getByRole("button", { name: "Remove all votes" }).click();
    await page.getByRole("button", { name: "Leave them" }).click();

    await expect.poll(async () =>
      (await readPollItems(pollId)).every((i) => (i["voters"] as unknown[]).length === 0)
    ).toBe(true);
  });
});
