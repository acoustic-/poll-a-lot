import { test, expect } from "./helpers/base";
import { SEEN_REACTION_POLL, SEEN_LABEL, seedMoviePollItemData, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { readPollItems, withFirestore } from "./helpers/firestore";
import { doc, setDoc } from "firebase/firestore";

function seenUserCount(items: Record<string, unknown>[]): number {
  const reactions = (items[0]?.["reactions"] as { label: string; users: unknown[] }[]) ?? [];
  return reactions.find((r) => r.label === SEEN_LABEL)?.users.length ?? 0;
}

test.describe("Seen reaction toggle", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    pollId = scopedId(SEEN_REACTION_POLL.id, testInfo.project.name);
    await stubMovieApis(page);
    // Reset the item to no reactions before each run.
    await withFirestore((db) =>
      setDoc(doc(db, `polls/${pollId}/pollItems/${SEEN_REACTION_POLL.itemId}`), {
        id: SEEN_REACTION_POLL.itemId,
        pollId,
        name: SEEN_REACTION_POLL.itemTitle,
        created: Date.now().toString(),
        order: 0,
        movieId: SEEN_REACTION_POLL.itemMovieId,
        moviePollItemData: seedMoviePollItemData(
          SEEN_REACTION_POLL.itemMovieId,
          SEEN_REACTION_POLL.itemTitle
        ),
        voters: [],
        reactions: [],
      })
    );
  });

  test("clicking the Seen chip adds then removes the current user's reaction", async ({ page }) => {
    await signInAsLocalUser(page);
    await page.goto(`/poll/${pollId}`);

    const chip = page.getByTestId("movie-reaction-visibility");
    await expect(chip).toBeVisible();

    // The chip toggles between the classes `reacted` and `unreacted`, so match
    // `reacted` only on a word boundary (never inside `unreacted`).
    await chip.click();
    await expect(chip).toHaveClass(/\breacted\b/);
    await expect.poll(async () => seenUserCount(await readPollItems(pollId))).toBe(1);

    const users =
      ((await readPollItems(pollId))[0]?.["reactions"] as { label: string; users: { localUserId?: string }[] }[])
        .find((r) => r.label === SEEN_LABEL)?.users ?? [];
    expect(users[0]?.localUserId).toBe("e2e-voter-1");

    await chip.click();
    await expect(chip).not.toHaveClass(/\breacted\b/);
    // PollItemService.reaction drops reactions whose users list empties out.
    await expect.poll(async () => seenUserCount(await readPollItems(pollId))).toBe(0);
  });
});
