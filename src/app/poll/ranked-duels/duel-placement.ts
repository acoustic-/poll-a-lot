import { hasFinishedDuelRun } from "./duel-cta";
import { DuelRecord, defaultTargetDuels, itemsNeedingPlacement, pairKey, unplacedItems } from "./rank-from-duels";

// "Latecomer" films — ones added after the voter had already worked through the
// list — get placement priority in the duel run. This module is the one place
// that decides which films those are, so the duel view and the poll page's
// opening-pair prefetch always agree on the first pair served.

function latecomersKey(pollId: string, voterKeyValue: string): string {
  return `duel-latecomers-${pollId}-${voterKeyValue}`;
}

/** The latecomers persisted for this voter. Empty (never throws) where storage
 *  can't be read, or for a voter that isn't resolved yet. */
export function loadLatecomers(pollId: string, voterKeyValue: string): Set<string> {
  if (!voterKeyValue || typeof localStorage === "undefined") return new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(latecomersKey(pollId, voterKeyValue)) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveLatecomers(pollId: string, voterKeyValue: string, ids: Iterable<string>): void {
  if (!voterKeyValue || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(latecomersKey(pollId, voterKeyValue), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/**
 * Whether the voter is already past their first run, so a film with no duels is
 * a late arrival rather than one the run simply hasn't reached. True once the
 * "finished" flag was written, or a full budget of distinct pairs is done —
 * judged against the full item count, since marking films seen or hidden mid-run
 * shrinks the servable set and would otherwise make a first run look finished.
 */
export function isPastFirstRun(
  pollId: string,
  voterKeyValue: string,
  totalItemCount: number,
  myDuels: DuelRecord[]
): boolean {
  return (
    hasFinishedDuelRun(pollId, voterKeyValue) ||
    new Set(myDuels.map((d) => pairKey(d.aId, d.bId))).size >= defaultTargetDuels(totalItemCount)
  );
}

/** `latecomers` plus, once past a first run, every servable film with no duels. */
export function withNewLatecomers(
  latecomers: ReadonlySet<string>,
  pastFirstRun: boolean,
  servableItems: string[],
  myDuels: DuelRecord[]
): Set<string> {
  const next = new Set(latecomers);
  if (pastFirstRun) for (const id of unplacedItems(servableItems, myDuels)) next.add(id);
  return next;
}

/** The latecomers still short of their placement duels — what `nextPair` and
 *  `targetDuelsForVoter` take as `placeItems`. */
export function placementSet(
  latecomers: ReadonlySet<string>,
  servableItems: string[],
  myDuels: DuelRecord[]
): Set<string> {
  if (!latecomers.size) return new Set();
  const stillThin = new Set(itemsNeedingPlacement(servableItems, myDuels));
  return new Set([...latecomers].filter((id) => stillThin.has(id)));
}
