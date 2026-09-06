import { DuelProgress } from "../../../model/duel";

export type DuelCtaKind = "start" | "run" | "done" | "nudge" | "sharpen";

/** Reads the per-voter "finished a run at least once" flag that
 *  DuelViewComponent writes on completion. SSR/private-mode safe. */
export function hasFinishedDuelRun(pollId: string, voterKeyValue: string): boolean {
  if (!voterKeyValue || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(`duel-finished-${pollId}-${voterKeyValue}`) === "1";
  } catch {
    return false;
  }
}

export interface DuelCtaState {
  kind: DuelCtaKind;
  /** Silkscreen headline, e.g. "6 OF YOUR 32". */
  headline: string;
  /** Quiet sub-line. Never names or counts other voters. */
  sub: string;
  /** Button label. */
  action: string;
}

/**
 * Which floating "duel" bar to show, from the viewer's own progress alone.
 *
 * - `start`   — no picks yet.
 * - `run`     — mid-run, below the budget.
 * - `done`    — budget reached *and* every real pair is covered — nothing left
 *               to do. Action re-runs from scratch.
 * - `sharpen` — budget reached but real pairs remain (the common case for a
 *               poll bigger than ~5 items): the top of the table is solid,
 *               more duels mainly refine the middle. Opt-in to keep going.
 * - `nudge`   — the voter finished, then movies were added, so there are pairs
 *               to do again. Fires when there's ≥1 unplaced movie AND the
 *               voter has otherwise finished (`hasFinishedBefore`,
 *               `placedComplete`, or the budget's been reached).
 *
 * `progress.total` is the *budget* (`≈2n`, clamped to `C(n,2)`), not the full
 * pair count — so "6 OF YOUR 32", never "6 OF YOUR 120". `pairsRemaining` is
 * the uncapped count of pairs still not done, which is what separates
 * `sharpen` (more to do if you want) from `done` (nothing left).
 *
 * No copy here implies a voter roster — the sub-lines only ever speak to "the
 * standing updates", never to who has or hasn't voted.
 */
export function duelCtaState(
  progress: DuelProgress,
  pairsRemaining: number,
  unplacedItemCount: number,
  hasFinishedBefore: boolean,
  // The voter has done every pair among the movies they *have* dueled, so any
  // shortfall to the budget is purely newly-added movies (drives the nudge).
  placedComplete = false
): DuelCtaState {
  const { done, total } = progress;

  if (total === 0) {
    return {
      kind: "start",
      headline: "RANKED DUELS",
      sub: "Add more movies to duel",
      action: "About",
    };
  }

  if (done === 0) {
    return {
      kind: "start",
      headline: "START DUELLING",
      sub: `${total} match-up${total === 1 ? "" : "s"}, one pick each`,
      action: "Start",
    };
  }

  const budgetReached = done >= total;

  if ((hasFinishedBefore || placedComplete || budgetReached) && unplacedItemCount > 0) {
    // Rough: ~2 duels to slot each new movie (a couple of binary-search-ish
    // comparisons), capped at how many pairs actually remain.
    const need = Math.max(1, Math.min(pairsRemaining, 2 * unplacedItemCount));
    return {
      kind: "nudge",
      headline: `${unplacedItemCount} NEW FILM${unplacedItemCount === 1 ? "" : "S"}`,
      sub: `~${need} duel${need === 1 ? "" : "s"} to place ${unplacedItemCount === 1 ? "it" : "them"}`,
      action: "Place",
    };
  }

  if (budgetReached) {
    if (pairsRemaining > 0) {
      return {
        kind: "sharpen",
        headline: "TOP LOOKS SOLID",
        sub: "A few more settles the messy middle",
        action: "Keep going",
      };
    }
    return {
      kind: "done",
      headline: "THAT'S A WRAP",
      sub: "The standing shifts as others vote",
      action: "Redo",
    };
  }

  return {
    kind: "run",
    headline: `${done} OF YOUR ${total}`,
    sub: "The standing updates as you go",
    action: "Continue",
  };
}
