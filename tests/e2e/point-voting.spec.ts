import { test, expect } from "./helpers/base";
import { POINT_VOTING_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { readPollItems } from "./helpers/firestore";
import { stubMovieApis } from "./helpers/tmdb";

const USER = { name: "Point Voter", localUserId: "point-voting-voter-1" };

function itemStepper(page, name: string) {
  return page.getByTestId("poll-item").filter({ hasText: name }).locator("point-vote-stepper");
}

async function pointsOn(page, name: string): Promise<number> {
  return Number(await itemStepper(page, name).locator(".points").textContent());
}

async function budgetUsed(page): Promise<number> {
  const text = await page.locator(".points-used").textContent();
  return Number(text.match(/(\d+)\s*\/\s*\d+/)?.[1]);
}

// The authoritative source of truth, read directly from Firestore rather than
// through the app's own (laggy-on-first-paint) listener — see beforeEach.
async function currentBudgetUsed(pollId: string, localUserId: string): Promise<number> {
  const items = await readPollItems(pollId);
  return items.reduce((sum, item) => {
    const voters = (item["voters"] as { localUserId?: string; points?: number }[]) ?? [];
    const voter = voters.find((v) => v.localUserId === localUserId);
    return sum + (voter?.points ?? 0);
  }, 0);
}

// Every mutating test below asserts on the *UI's* state, which updates
// optimistically off Firestore's local write cache before the write is
// acknowledged by the server (same durability gap waitForPollItemCount in
// helpers/firestore.ts exists to close for pollItem counts). Playwright tears
// the page down at the end of each test, which can race that flush — closing
// right after an unflushed write can lose it — and the *next* test's
// beforeEach reads the "truth" via a separate Firestore client
// (currentBudgetUsed), so a lost write there surfaces as a wrong `before`
// value in a later, unrelated-looking test. Call this at the end of any test
// that changes the budget to confirm the write is durable before its page
// closes.
async function waitForBudgetUsed(
  pollId: string,
  localUserId: string,
  expected: number,
  timeoutMs = 10000
): Promise<void> {
  const start = Date.now();
  let actual = await currentBudgetUsed(pollId, localUserId);
  while (actual !== expected && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    actual = await currentBudgetUsed(pollId, localUserId);
  }
  if (actual !== expected) {
    throw new Error(`Timed out waiting for polls/${pollId} budget used by ${localUserId} to reach ${expected} (has ${actual})`);
  }
}

// Clicks `button` while it's enabled (up to a safety cap), waiting for each
// click's allocation to be truly durable before firing the next.
// pointAllocationInFlight (poll-item.service.ts) sets its flag before the
// write starts and only clears it in a `finally` after updateDoc's promise
// resolves — i.e. once the server acks it — but the UI's point count updates
// off Firestore's local write cache, which reflects the change as soon as
// it's queued, well before that ack. Waiting only on pointsOn(page, ...) (as
// this used to) can see the incremented count and fire the next click while
// pointAllocationInFlight is still true, which the service drops silently:
// the test then hangs waiting for a count bump that will never come, since
// that click never happened at all. currentBudgetUsed reads via a separate
// Firestore client with no local-cache path, so it can only observe a value
// once the write is genuinely durable — waiting on that instead guarantees
// pointAllocationInFlight has already been reset by the time we loop.
async function clickAddWhileEnabled(page, button, pollId: string, itemName: string, maxIterations: number) {
  for (let i = 0; i < maxIterations; i++) {
    if (await button.isDisabled()) return;
    const before = await pointsOn(page, itemName);
    const usedBefore = await currentBudgetUsed(pollId, USER.localUserId);
    await button.click();
    await expect.poll(() => pointsOn(page, itemName), { timeout: 10000 }).toBe(before + 1);
    await waitForBudgetUsed(pollId, USER.localUserId, usedBefore + 1);
  }
}

// Serial, same seeded user throughout: budget is tracked per-user across the
// whole poll, so these tests build on (and must see) each other's allocations
// rather than each starting from a clean budget. That ordering only holds
// within one Playwright project though — chromium and Mobile Chrome each get
// their own worker and would otherwise spend the same budget concurrently
// against the same poll doc, so `pollId` is scoped per project (see
// fixtures.ts's scopedId and global-setup.ts's seeding).
test.describe.serial("point voting", () => {
  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await stubMovieApis(page);
    pollId = scopedId(POINT_VOTING_POLL.id, testInfo.project.name);
    await signInAsLocalUser(page, USER);

    // The points-used pill renders instantly with a 0-everything default and
    // then jumps to the real value once Firestore's listener delivers this
    // user's actual document — read the true value directly (bypassing the
    // app entirely) and wait for the UI to catch up to it before any test
    // reads the pill, or an assertion right after navigation can race a stale
    // "0" read. (page.waitForLoadState("networkidle") doesn't work for this:
    // Firestore's listener is a long-lived streaming connection, so the page
    // never actually goes network-idle.)
    const truth = await currentBudgetUsed(pollId, USER.localUserId);
    await page.goto(`/poll/${pollId}`);
    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(truth);
  });

  test("+ allocates a point", async ({ page }) => {
    const before = await pointsOn(page, "Option A");
    const usedBefore = await budgetUsed(page);

    await itemStepper(page, "Option A").getByRole("button", { name: "Add a point" }).click();

    await expect.poll(() => pointsOn(page, "Option A"), { timeout: 10000 }).toBe(before + 1);
    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(usedBefore + 1);
    await waitForBudgetUsed(pollId, USER.localUserId, usedBefore + 1);
  });

  test("- deallocates a point", async ({ page }) => {
    const before = await pointsOn(page, "Option A");
    const usedBefore = await budgetUsed(page);
    expect(before).toBeGreaterThan(0); // depends on the previous test's allocation

    await itemStepper(page, "Option A").getByRole("button", { name: "Remove a point" }).click();

    await expect.poll(() => pointsOn(page, "Option A"), { timeout: 10000 }).toBe(before - 1);
    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(usedBefore - 1);
    await waitForBudgetUsed(pollId, USER.localUserId, usedBefore - 1);
  });

  test("the per-item cap disables + once reached, while budget remains", async ({ page }) => {
    // Spend up to POINT_VOTING_POLL.maxPerItem on Option A alone.
    const addButton = itemStepper(page, "Option A").getByRole("button", { name: "Add a point" });
    await clickAddWhileEnabled(page, addButton, pollId, "Option A", POINT_VOTING_POLL.maxPerItem);

    await expect.poll(() => pointsOn(page, "Option A"), { timeout: 10000 }).toBe(POINT_VOTING_POLL.maxPerItem);
    await expect(addButton).toBeDisabled();
    expect(await budgetUsed(page)).toBeLessThan(POINT_VOTING_POLL.budget);

    // Option B is a different item — its own cap hasn't been hit, so it can
    // still accept points even though Option A's can't.
    await expect(itemStepper(page, "Option B").getByRole("button", { name: "Add a point" })).toBeEnabled();
    await waitForBudgetUsed(pollId, USER.localUserId, POINT_VOTING_POLL.maxPerItem);
  });

  test("budget exhaustion disables + on every item", async ({ page }) => {
    // Option A is already at its per-item cap (previous test) — spend the rest
    // of the budget on Option B until the whole budget is used.
    const addB = itemStepper(page, "Option B").getByRole("button", { name: "Add a point" });
    await clickAddWhileEnabled(page, addB, pollId, "Option B", POINT_VOTING_POLL.budget);

    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(POINT_VOTING_POLL.budget);
    await expect(itemStepper(page, "Option A").getByRole("button", { name: "Add a point" })).toBeDisabled();
    await expect(addB).toBeDisabled();
    await waitForBudgetUsed(pollId, USER.localUserId, POINT_VOTING_POLL.budget);
  });

  test("rapid double-tap does not double-spend past the budget", async ({ page }) => {
    // Budget is fully spent (previous test) — free up exactly one point so a
    // single '+' is legal, then fire two rapid '+' clicks on it. Without
    // pointAllocationInFlight's single-flight guard, both could read the same
    // "budget not yet exhausted" snapshot and each write a point, landing two
    // allocations for one point of headroom.
    const removeB = itemStepper(page, "Option B").getByRole("button", { name: "Remove a point" });
    await removeB.click();
    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(POINT_VOTING_POLL.budget - 1);
    // This click is itself an allocatePoint() call, so it sets
    // pointAllocationInFlight too — without waiting for it to durably clear,
    // both of the rapid clicks below can fire while it's still true and get
    // silently dropped (not just one of them, defeating the point of this
    // test, which needs exactly one to go through).
    await waitForBudgetUsed(pollId, USER.localUserId, POINT_VOTING_POLL.budget - 1);

    const addB = itemStepper(page, "Option B").getByRole("button", { name: "Add a point" });
    const beforePoints = await pointsOn(page, "Option B");
    await Promise.all([addB.click(), addB.click()]);

    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(POINT_VOTING_POLL.budget);
    expect(await pointsOn(page, "Option B")).toBe(beforePoints + 1);
    await waitForBudgetUsed(pollId, USER.localUserId, POINT_VOTING_POLL.budget);
  });

  test("clear my votes resets only this user's allocations", async ({ page }) => {
    expect(await budgetUsed(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Clear my votes" }).click();

    await expect.poll(() => budgetUsed(page), { timeout: 10000 }).toBe(0);
    await expect.poll(() => pointsOn(page, "Option A"), { timeout: 10000 }).toBe(0);
    await expect.poll(() => pointsOn(page, "Option B"), { timeout: 10000 }).toBe(0);
    await waitForBudgetUsed(pollId, USER.localUserId, 0);
  });
});
