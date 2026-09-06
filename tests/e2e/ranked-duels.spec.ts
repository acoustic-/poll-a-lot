import { test, expect } from "./helpers/base";
import { DUELS_POLL, LOCKED_DUELS_POLL, LOCAL_OWNER_REF, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { failOnConsoleErrors } from "./helpers/console";
import { withFirestore } from "./helpers/firestore";
import { doc, getDoc, setDoc } from "firebase/firestore";

// The spec's user IS the poll owner (DUELS_POLL is seeded with LOCAL_OWNER_REF),
// so it can both cast duels and run the owner-only "clear duels" edit.
const USER = { name: LOCAL_OWNER_REF.name, localUserId: LOCAL_OWNER_REF.localUserId! };

async function ballotPicks(pollId: string, voterKey: string) {
  return withFirestore(async (db) => {
    const snap = await getDoc(doc(db, `polls/${pollId}/duelBallots/${voterKey}`));
    return snap.exists() ? ((snap.data()["picks"] as unknown[]) ?? []) : [];
  });
}

async function seedBallot(pollId: string, voterKey: string, order: string[]) {
  const ids = DUELS_POLL.items.map((i) => i.id);
  const rank = new Map(order.map((id, i) => [id, i]));
  const picks: { aId: string; bId: string; winnerId: string; ts: number }[] = [];
  let ts = 1;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      picks.push({ aId: a, bId: b, winnerId: rank.get(a)! < rank.get(b)! ? a : b, ts: ts++ });
    }
  await withFirestore((db) =>
    setDoc(doc(db, `polls/${pollId}/duelBallots/${voterKey}`), {
      voterRef: { id: voterKey, name: voterKey },
      updatedAt: Date.now(),
      picks,
    })
  );
}

async function addPollItem(pollId: string, id: string, name: string, movieId: number, order = 99) {
  await withFirestore((db) =>
    setDoc(doc(db, `polls/${pollId}/pollItems/${id}`), {
      id,
      pollId,
      name,
      created: (Date.now() + order).toString(),
      order,
      voters: [],
      movieId,
      moviePollItemData: {
        id: movieId, title: name, originalTitle: name, tagline: "",
        overview: `${name} — seeded.`, director: "E2E", productionCountry: "United States of America",
        runtime: 120, releaseDate: "2014-11-05", posterPath: "/p.jpg", backdropPath: "/b.jpg", tmdbRating: 8,
      },
    })
  );
}

const addItem = (pollId: string) =>
  addPollItem(pollId, DUELS_POLL.addedItem.id, DUELS_POLL.addedItem.name, DUELS_POLL.addedItem.movieId);

// There's no separate "combined ranking" list any more — the poll-item cards
// themselves are sorted by the live duel ranking (poll-item-sort.pipe's
// 'duelrank' branch), so card DOM order IS the ranking. `.title-text` is the
// span holding just `{{movie?.title}}`, isolated from the sibling edit button
// and original-title div that also live inside the same `<h1>`.
const cardOrder = (page) =>
  page.locator("movie-poll-item h1.title .title-text").evaluateAll((els) =>
    els.map((el) => el.textContent?.trim() ?? "")
  );

const standingFor = (page, title: string) =>
  page.locator("movie-poll-item", { hasText: title }).locator(".duel-standing");

test.describe.serial("ranked duels", () => {
  // Each test drives a multi-round duel loop over real Firestore-emulator
  // round-trips (recordDuel does a read-then-write per pick) — comfortably
  // inside the default 30s on a quiet machine, but tight under load.
  test.describe.configure({ timeout: 60_000 });

  let pollId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await stubMovieApis(page);
    pollId = scopedId(DUELS_POLL.id, testInfo.project.name);
    await signInAsLocalUser(page, USER);
  });

  test("the combined ranking sorts the poll-item cards from the pre-seeded ballot", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    await page.goto(`/poll/${pollId}`);

    // Seed ballot order: Dark Knight > Matrix > Inception > Fight Club.
    await expect
      .poll(() => cardOrder(page), { timeout: 10000 })
      .toEqual(["The Dark Knight", "The Matrix", "Inception", "Fight Club"]);
    // The top card also carries the rank-1 standing badge.
    await expect(page.locator("movie-poll-item .duel-standing").first())
      .toHaveAttribute("aria-label", /^Rank 1,/);

    assertNoConsoleErrors();
  });

  test("the duel dialog shows everything on one phone screen — no scroll", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    for (const size of [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 467, height: 760 },
    ]) {
      await page.setViewportSize(size);
      await page.goto(`/poll/${pollId}`);
      await page.locator("duel-voting-bar .dvb-act").click();
      await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500); // let the backdrop images / layout settle

      // Both PICK buttons and the footer are fully on screen.
      await expect(page.locator("duel-view .dv-pick").first()).toBeInViewport({ ratio: 1 });
      await expect(page.locator("duel-view .dv-pick").last()).toBeInViewport({ ratio: 1 });
      await expect(page.locator("duel-view .dv-footer")).toBeInViewport({ ratio: 1 });

      // The genre chips are the responsive-priority row — they must stay fully
      // inside the band (not clipped by `.dv-details { overflow: hidden }`) even
      // when it's short, since they sit above the shrinkable tagline/overview.
      for (const band of [0, 1]) {
        const wrap = page.locator("duel-view .dv-band-wrap").nth(band);
        const bandBox = await wrap.locator(".dv-band").boundingBox();
        const chips = wrap.locator(".dv-genre");
        for (let i = 0; i < (await chips.count()); i++) {
          const chip = await chips.nth(i).boundingBox();
          expect(chip, `genre chip ${i} in band ${band} @ ${size.width}px`).not.toBeNull();
          expect(chip!.y + chip!.height).toBeLessThanOrEqual(bandBox!.y + bandBox!.height + 1);
          expect(chip!.x + chip!.width).toBeLessThanOrEqual(bandBox!.x + bandBox!.width + 1);
        }
      }

      // The divider runs full-bleed (it overflows the sheet horizontally by
      // design), so check only that it sits within the viewport vertically.
      const seamBox = await page.locator("duel-view .dv-divider").boundingBox();
      expect(seamBox).not.toBeNull();
      expect(seamBox!.y).toBeGreaterThanOrEqual(0);
      expect(seamBox!.y + seamBox!.height).toBeLessThanOrEqual(size.height + 1);

      // Nothing inside the dialog is an actual scroll container.
      const scrollers = await page.locator("duel-view .dv").evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>("*"), root as HTMLElement]
          .filter((el) => {
            const oy = getComputedStyle(el).overflowY;
            return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 1;
          })
          .map((el) => el.className || el.tagName)
      );
      expect(scrollers, `scroll containers at ${size.width}x${size.height}`).toEqual([]);

      await page.screenshot({ path: `test-results/duel-dialog-${size.width}x${size.height}.png` });
      await page.locator("duel-view .dv-close").click();
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    assertNoConsoleErrors();
  });

  test("running a duel run records a ballot and shifts the aggregate; a contrarian second voter shifts it again", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    await page.goto(`/poll/${pollId}`);
    await expect(page.locator("duel-voting-bar .dvb-pill")).toBeVisible({ timeout: 15000 });

    // Run the whole stream, always picking the second band (Fight Club-biased,
    // since it's usually the underdog against the seed order).
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 8; i++) {
      if (await page.locator("duel-view .dv-complete").count()) break;
      await page.locator("duel-view .dv-band-wrap").last().locator(".dv-pick").click({ timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await expect(page.locator("duel-view .dv-complete")).toBeVisible({ timeout: 15000 });
    await page.locator("duel-view .dv-done-btn").click();

    // Ballot persisted: 6 pairs for 4 items.
    await expect.poll(() => ballotPicks(pollId, USER.localUserId).then((p) => p.length), { timeout: 15000 }).toBe(6);
    // The pill now reads "done".
    await expect(page.locator("duel-voting-bar .dvb-k")).toHaveText("THAT'S A WRAP", { timeout: 15000 });

    // A contrarian ballot (Fight Club first) should pull Fight Club up the list.
    await seedBallot(pollId, "e2e-duel-contrarian", ["duel-b", "duel-d", "duel-c", "duel-a"]);
    await page.reload();
    await expect
      .poll(() => cardOrder(page).then((n) => n.indexOf("Fight Club")), { timeout: 10000 })
      .toBeLessThan(3); // no longer last

    assertNoConsoleErrors();
  });

  test("a movie added mid-poll shows as 'not yet rated', then folds in", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    await page.goto(`/poll/${pollId}`);
    await expect(page.locator("movie-poll-item").first()).toBeVisible();

    await addItem(pollId); // Interstellar

    // Its card shows the "not yet rated" badge, and the pill nudges to place it.
    await expect(standingFor(page, "Interstellar")).toHaveClass(/unrated/, { timeout: 15000 });
    await expect(page.locator("duel-voting-bar .dvb-k")).toHaveText(/NEW FILM/, { timeout: 15000 });

    // Re-enter: every remaining pair is one involving the new film.
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 6; i++) {
      if (await page.locator("duel-view .dv-complete").count()) break;
      await expect(page.locator("duel-view .dv-title", { hasText: "Interstellar" })).toBeVisible({ timeout: 15000 });
      await page.locator("duel-view .dv-band-wrap").first().locator(".dv-pick").click({ timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await page.locator("duel-view .dv-close").click();

    // It graduates out of "not yet rated" into a real ranked slot.
    await expect(standingFor(page, "Interstellar")).not.toHaveClass(/unrated/, { timeout: 15000 });

    assertNoConsoleErrors();
  });

  test("'Redo' on a finished run clears just this voter's ballot", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    // Earlier tests in this serial file may have already left USER's ballot
    // complete (or partially done) — start this test from a known "no picks
    // yet" state regardless of what ran before. (An anonymous client can't
    // `delete` per firestore.rules, so overwrite with an empty ballot instead —
    // the same fallback DuelService.resetMyDuels uses for a weak voter.)
    await withFirestore((db) =>
      setDoc(doc(db, `polls/${pollId}/duelBallots/${USER.localUserId}`), {
        voterRef: { localUserId: USER.localUserId, name: USER.name },
        updatedAt: Date.now(),
        picks: [],
      })
    );
    await page.goto(`/poll/${pollId}`);
    await expect(page.locator("duel-voting-bar .dvb-k")).toHaveText("START DUELLING", { timeout: 15000 });

    // Finish a run first. By this point in the serial file, Interstellar has
    // been added (test 3), so there may be up to C(5,2) = 10 pairs to cover.
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 15; i++) {
      if (await page.locator("duel-view .dv-complete").count()) break;
      await page.locator("duel-view .dv-band-wrap").first().locator(".dv-pick").click({ timeout: 15000 });
      await page.waitForTimeout(600);
    }
    await expect(page.locator("duel-view .dv-complete")).toBeVisible({ timeout: 15000 });
    await page.locator("duel-view .dv-done-btn").click();
    await expect
      .poll(() => ballotPicks(pollId, USER.localUserId).then((p) => p.length), { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect(page.locator("duel-voting-bar .dvb-k")).toHaveText("THAT'S A WRAP", { timeout: 15000 });

    // Redo -> confirm -> the voter's own ballot is wiped; the seed voter's is untouched.
    await page.locator("duel-voting-bar .dvb-act").click(); // "Redo"
    await page.getByRole("button", { name: "Redo my duels" }).click();
    await expect
      .poll(() => ballotPicks(pollId, USER.localUserId).then((p) => p.length), { timeout: 15000 })
      .toBe(0);
    expect((await ballotPicks(pollId, DUELS_POLL.seedVoter.id)).length).toBeGreaterThan(0);

    // The re-opened dialog starts a fresh run.
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    await page.locator("duel-view .dv-close").click();

    assertNoConsoleErrors();
  });

  test("a bigger poll caps the run at the budget, then offers 'keep going to sharpen'", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);

    // Grow the poll past the point where the budget (2×n) covers every pair.
    // By now the poll has 5 items (Interstellar, added in test 3); +3 => 8,
    // budget defaultTargetDuels(8) = 16, well under C(8,2) = 28.
    await addPollItem(pollId, "duel-f", "Your Name.", 372058, 101);
    await addPollItem(pollId, "duel-g", "Parasite", 496243, 102);
    await addPollItem(pollId, "duel-h", "Top Gun: Maverick", 361743, 103);

    // Seed USER's ballot with exactly the budget's worth of picks (16),
    // spanning all 8 items — driving 16 live transactions here just to reach
    // this state is slow and flaky on the emulator, and the picking loop is
    // already covered by the other tests.
    const ids = ["duel-a", "duel-b", "duel-c", "duel-d", "duel-e", "duel-f", "duel-g", "duel-h"];
    const allPairs: [string, string][] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) allPairs.push([ids[i], ids[j]]);
    await withFirestore((db) =>
      setDoc(doc(db, `polls/${pollId}/duelBallots/${USER.localUserId}`), {
        voterRef: { localUserId: USER.localUserId, name: USER.name },
        updatedAt: Date.now(),
        picks: allPairs.slice(0, 16).map(([a, b], k) => ({ aId: a, bId: b, winnerId: a, ts: k + 1 })),
      })
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/poll/${pollId}`);
    // Budget reached with real pairs still left => "sharpen", not "your run is done".
    await expect(page.locator("duel-voting-bar .dvb-k")).toHaveText("TOP LOOKS SOLID", { timeout: 15000 });
    // The "sharpen" pill must have its own gradient (regression: it had none,
    // so it was white text on the page ground).
    const pillBg = await page
      .locator("duel-voting-bar .dvb-pill")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(pillBg).toContain("gradient");
    await page.screenshot({ path: "test-results/duel-sharpen-pill.png" });

    // "Keep going" re-opens with the budget lifted: a live duel band, NOT the
    // completion screen (which is exactly what a capped re-entry at
    // done == budget would show).
    await page.locator("duel-voting-bar .dvb-act").click();
    await expect(page.locator("duel-view .dv-band").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("duel-view .dv-complete")).toHaveCount(0);
    // One pick lands past the budget.
    await page.locator("duel-view .dv-band-wrap").first().locator(".dv-pick").click({ timeout: 15000 });
    await expect
      .poll(() => ballotPicks(pollId, USER.localUserId).then((p) => p.length), { timeout: 15000 })
      .toBe(17);
    await page.locator("duel-view .dv-close").click();

    assertNoConsoleErrors();
  });

  test("a locked duel poll shows no 'start duels' pill", async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);
    await page.goto(`/poll/${LOCKED_DUELS_POLL.id}`);
    await expect(page.getByText(/Poll closed from voting/)).toBeVisible();
    // The standing still renders on the cards even though voting is closed.
    await expect(page.locator("movie-poll-item .duel-standing").first()).toBeVisible();
    await expect(page.locator("duel-voting-bar")).toHaveCount(0);
    assertNoConsoleErrors();
  });
});
