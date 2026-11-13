/**
 * Ranked Duels — pure pairwise-aggregation core.
 *
 * No Angular or Firebase imports by design: the ranking maths lives in one
 * place, stays unit-testable in isolation, and never adds an edge to the module
 * graph that `yarn test:cycles` walks.
 *
 * `rankFromDuels` folds a flat list of `(voter, a, b, winner)` records — pooled
 * across every voter — into one combined ranked list over the poll's *current*
 * item set. `nextPair` picks the next matchup to serve one voter.
 *
 * Tolerances the display layer relies on:
 *  - Items added mid-poll (no duels yet) come back `rated: false`, sorted last.
 *  - Records that reference an item no longer in `itemIds` are ignored.
 *  - At most one pick per voter per pair counts — the most recent one — so no
 *    voter can outweigh another by hammering a single matchup.
 *  - Output is a pure function of the deduped vote *set*, never the order the
 *    records arrived in: scores come from a batch Bradley–Terry MLE fit, not a
 *    running per-vote update, so an early voter carries no more weight than a
 *    late one. `rank-from-duels.sim.spec.ts` pins this ("shuffle → same list").
 */

export type RankingMethod = "winRate" | "copeland" | "bradleyTerry";
/**
 * `"infoGain"` (default): serve the pair that most reduces global ranking
 * uncertainty — closest current scores first, then fewest comparisons.
 * `"coverage"`: walk a per-voter shuffle of what's left (tiny polls, fallback).
 */
export type PairStrategy = "infoGain" | "coverage";

/** One voter's pick in one duel. `voterKey` is the ballot doc id. */
export interface DuelRecord {
  voterKey: string;
  aId: string;
  bId: string;
  winnerId: string;
  ts?: number;
}

export interface RankOptions {
  /**
   * Aggregation method. Default `"bradleyTerry"` — a batch MLE fit, robust to
   * the uneven/sparse participation this mode produces and order-independent
   * by construction. `"winRate"` stays available (and is what the poll-item
   * badge still *displays* as "wins X%"); `"copeland"` too.
   */
  method?: RankingMethod;
  /** Laplace prior for winRate smoothing: `(wins + prior) / (matchups + 2·prior)`. Default 1. */
  prior?: number;
  /**
   * Strength of the Bradley–Terry prior — `BT_PRIOR` by default. See
   * `bradleyTerry` for what it does and why it is not optional in practice.
   */
  btPrior?: number;
  /** When set, only records whose `voterKey` is in the set are counted. */
  voterFilter?: Set<string>;
  /**
   * Bradley–Terry only. Weight each voter's picks so every voter carries the
   * same total, instead of letting whoever did more duels out-vote the rest
   * (see `voterWeights`). Default `true`; a single voter, or voters with equal
   * pick counts, are unaffected. Pass `false` for the raw one-pick-one-vote fit.
   */
  equalVoterWeight?: boolean;
}

export interface RankedItem {
  itemId: string;
  /** 1-based, dense. Unrated items keep counting up but sit after every rated item. */
  rank: number;
  /** Method-specific: win rate (0..1), Copeland points, or Bradley–Terry strength. */
  score: number;
  wins: number;
  losses: number;
  matchups: number;
  /** `false` => no duels yet (or, for BT, stranded in a disconnected component). Sorted last. */
  rated: boolean;
}

const SEP = "|";

/**
 * Default Bradley–Terry prior: `alpha` virtual wins and `alpha` virtual losses
 * against an average-strength opponent, for every item.
 *
 * Picked by closed-loop simulation (selection and scoring both running at the
 * candidate value) across three voter regimes — decisive, undecided and the
 * podium case the sim spec models — and checked against the live 33-film poll.
 * The trade-off is real in both directions:
 *
 *   alpha   Kendall tau (decisive/undecided/podium)   cards at 0-3% or 97-100%
 *   0       0.866 / 0.770 / 0.830                     70%   <- the old behaviour
 *   0.1     0.882 / 0.785 / 0.907                     44%
 *   0.25    0.837 / 0.775 / 0.904                     19%
 *   0.4     0.877 / 0.771 / 0.840                      7%   <- chosen
 *   1       0.749 / 0.691 / 0.824                      0%
 *
 * Too small and the badge percentages stay pinned at the ends; too large and the
 * fit over-shrinks, which costs real ranking accuracy — at `alpha = 1` tau drops
 * sharply, because a poll at the default `2n` budget gives each item only about
 * four comparisons, so a prior worth two of them drowns the evidence. 0.4 keeps
 * accuracy at or above the unregularised fit while taking the live poll from 18
 * of 27 percentage cards pinned at an extreme down to 2 — and the two that
 * remain have genuinely extreme records.
 */
export const BT_PRIOR = 0.4;

/** Order-independent key for an unordered pair — the format `nextPair`'s
 *  `exclude` set (the duel-view's skip list) is expected in. */
export function pairKey(x: string, y: string): string {
  return x < y ? x + SEP + y : y + SEP + x;
}

interface Tally {
  wins: Map<string, number>;
  losses: Map<string, number>;
  matchups: Map<string, number>;
  /** `h2h.get(i).get(j)` = number of (deduped) voters who picked i over j. */
  h2h: Map<string, Map<string, number>>;
  /**
   * Like `h2h`, but each pick counts `voterWeight(voter)` instead of 1 (see
   * `voterWeights`). Only the Bradley–Terry fit reads it — `wins` / `losses` /
   * `matchups` / `h2h` stay whole-number counts for the badges, Copeland and
   * `contestedPairs`.
   */
  h2hWeighted: Map<string, Map<string, number>>;
}

/**
 * Per-voter pick weight so every voter contributes the same total, however many
 * duels they chose to do (a voter who presses "keep going" must not out-vote
 * one who stopped at the budget). `weight = mean picks per voter / this voter's
 * picks`, so the weights always sum to the raw pick count — the evidence the
 * Bradley–Terry prior (`BT_PRIOR`) was tuned against — and a lone voter, or
 * voters with equal counts, get exactly 1 (no change). Expects deduped duels.
 */
function voterWeights(duels: DuelRecord[], equalise: boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of duels) counts.set(d.voterKey, (counts.get(d.voterKey) ?? 0) + 1);
  if (!equalise || counts.size === 0) return new Map([...counts.keys()].map((k) => [k, 1]));
  const mean = duels.length / counts.size;
  return new Map([...counts].map(([voter, n]) => [voter, mean / n]));
}

/**
 * Keep, per `(voter, unordered pair)`, only the most recent record — by `ts`
 * when present, else by position. This both lets a voter change their mind and
 * caps every voter's contribution to ±1 per pair. Records that are malformed,
 * reference a missing item, or fail the voter filter are dropped here.
 */
function dedupeDuels(
  duels: DuelRecord[],
  valid: Set<string>,
  voterFilter?: Set<string>
): DuelRecord[] {
  const chosen = new Map<string, { rec: DuelRecord; ts: number }>();
  for (const rec of duels) {
    if (!rec || rec.aId === rec.bId) continue;
    if (!valid.has(rec.aId) || !valid.has(rec.bId)) continue;
    if (rec.winnerId !== rec.aId && rec.winnerId !== rec.bId) continue;
    if (voterFilter && !voterFilter.has(rec.voterKey)) continue;

    const key = rec.voterKey + SEP + pairKey(rec.aId, rec.bId);
    const ts = typeof rec.ts === "number" ? rec.ts : -1;
    const prev = chosen.get(key);
    // Most recent wins; on an exact `ts` tie, the lexically-smaller winnerId —
    // a deterministic, array-order-independent tiebreak (two same-voter,
    // same-pair, same-ts records with the same winner are identical anyway).
    if (!prev || ts > prev.ts || (ts === prev.ts && rec.winnerId < prev.rec.winnerId)) {
      chosen.set(key, { rec, ts });
    }
  }
  return [...chosen.values()].map((v) => v.rec);
}

function tally(
  itemIds: string[],
  duels: DuelRecord[],
  equaliseVoters = false
): Tally {
  const wins = new Map(itemIds.map((id) => [id, 0]));
  const losses = new Map(itemIds.map((id) => [id, 0]));
  const matchups = new Map(itemIds.map((id) => [id, 0]));
  const h2h = new Map(itemIds.map((id) => [id, new Map<string, number>()]));
  const h2hWeighted = new Map(itemIds.map((id) => [id, new Map<string, number>()]));
  const weights = voterWeights(duels, equaliseVoters);

  for (const d of duels) {
    const winner = d.winnerId;
    const loser = d.winnerId === d.aId ? d.bId : d.aId;
    wins.set(winner, wins.get(winner)! + 1);
    losses.set(loser, losses.get(loser)! + 1);
    matchups.set(winner, matchups.get(winner)! + 1);
    matchups.set(loser, matchups.get(loser)! + 1);
    const row = h2h.get(winner)!;
    row.set(loser, (row.get(loser) ?? 0) + 1);
    const weightedRow = h2hWeighted.get(winner)!;
    weightedRow.set(loser, (weightedRow.get(loser) ?? 0) + weights.get(d.voterKey)!);
  }
  return { wins, losses, matchups, h2h, h2hWeighted };
}

function winRateScores(rated: string[], t: Tally, prior: number): Map<string, number> {
  return new Map(
    rated.map((id) => [
      id,
      (t.wins.get(id)! + prior) / (t.matchups.get(id)! + 2 * prior),
    ])
  );
}

/** Copeland over *observed* pairs only: score = pairs won + ½ per tied pair. */
function copelandScores(ids: string[], t: Tally): Map<string, number> {
  const score = new Map(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const ab = t.h2h.get(a)?.get(b) ?? 0;
      const ba = t.h2h.get(b)?.get(a) ?? 0;
      if (ab + ba === 0) continue;
      if (ab > ba) score.set(a, score.get(a)! + 1);
      else if (ba > ab) score.set(b, score.get(b)! + 1);
      else {
        score.set(a, score.get(a)! + 0.5);
        score.set(b, score.get(b)! + 0.5);
      }
    }
  }
  return score;
}

/**
 * Bradley–Terry strengths via a *regularised* MM / Zermelo iteration.
 *
 * The unregularised MLE this used to compute has no finite solution unless every
 * subset of items has both a win and a loss against the rest — which a real poll
 * almost never satisfies. An item that has never won sat at exactly 0 (tying with
 * every other winless item, so their order fell through to the matchup/id
 * tiebreak), and an unbeaten item climbed for the whole iteration budget. On a
 * live 33-film poll that put 18 of the 27 cards showing a percentage at 0–2% or
 * 99–100%, and ranked a 3–1 film below several 1–4 ones.
 *
 * `alpha` fixes that by giving every item `alpha` virtual wins and `alpha`
 * virtual losses against a fixed anchor of strength 1 — which is exactly the
 * geometric-mean normalisation point, i.e. "an average item". Every strength is
 * then finite and strictly positive, the fit shrinks sparse items toward the
 * middle instead of to an endpoint, and a newly added item lands somewhere
 * plausible on its first duel rather than at #1 or last. Ranking accuracy is
 * unchanged (paired simulation: Kendall tau and "picks the true best" are flat
 * to very slightly better) — the prior only removes the degenerate cases.
 *
 * Also returns the set of items that are actually comparable: an item stranded in
 * a component disconnected from the main body of duels can't be placed on the
 * same scale, so it is handed back as `rated: false` rather than given a
 * meaningless strength. The prior does technically put every item on one scale
 * via the anchor, but a clique that has never met the rest of the field is still
 * not meaningfully comparable to it, so the demotion stays.
 */
function bradleyTerry(
  rated: string[],
  t: Tally,
  alpha: number
): { strengths: Map<string, number>; connected: Set<string> } {
  const n = rated.length;
  if (n === 0) return { strengths: new Map(), connected: new Set() };

  const idx = new Map(rated.map((id, i) => [id, i]));
  const N: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  // Voter-weighted win totals (replaces the raw `t.wins`): see `voterWeights`.
  const W: number[] = new Array(n).fill(0);
  for (const winnerId of rated) {
    const i = idx.get(winnerId)!;
    for (const [loserId, c] of t.h2hWeighted.get(winnerId)!) {
      const j = idx.get(loserId);
      if (j === undefined) continue;
      N[i][j] += c;
      N[j][i] += c;
      W[i] += c;
    }
  }

  // Connected components over pairs that have at least one comparison.
  const parent = rated.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (N[i][j] > 0) parent[find(i)] = find(j);
    }
  }
  const compMatchups = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    compMatchups.set(r, (compMatchups.get(r) ?? 0) + t.matchups.get(rated[i])!);
  }
  let bestRoot = find(0);
  for (const [root, m] of compMatchups) {
    const bm = compMatchups.get(bestRoot)!;
    if (m > bm || (m === bm && rated[root] < rated[bestRoot])) bestRoot = root;
  }
  const connected = new Set(rated.filter((_, i) => find(i) === bestRoot));

  let p = new Array(n).fill(1);
  for (let iter = 0; iter < 200; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      // The prior's own term: `alpha` wins and `alpha` losses against an
      // opponent pinned at strength 1, i.e. 2·alpha comparisons contributing
      // 2·alpha / (p[i] + 1) to the denominator. Always > 0, so no item can
      // divide by zero or be handed a strength of exactly 0 any more.
      let denom = (2 * alpha) / (p[i] + 1);
      for (let j = 0; j < n; j++) {
        if (j === i || N[i][j] === 0) continue;
        denom += N[i][j] / (p[i] + p[j]);
      }
      next[i] = (W[i] + alpha) / denom;
    }
    // Every strength is positive now, so the geometric mean runs over all of
    // them — no need to filter, and the normalisation point stays exactly the
    // strength-1 anchor the prior is defined against.
    const gm = Math.exp(next.reduce((s, v) => s + Math.log(v), 0) / n);
    for (let i = 0; i < n; i++) next[i] /= gm;
    let delta = 0;
    for (let i = 0; i < n; i++) delta = Math.max(delta, Math.abs(next[i] - p[i]));
    p = next;
    if (delta < 1e-10) break;
  }
  return { strengths: new Map(rated.map((id, i) => [id, p[i]])), connected };
}

function comparatorFor(
  method: RankingMethod,
  scores: Map<string, number>,
  t: Tally
): (a: string, b: string) => number {
  return (a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    if (sa !== sb) return sb - sa;

    if (method === "copeland") {
      const na = t.wins.get(a)! - t.losses.get(a)!;
      const nb = t.wins.get(b)! - t.losses.get(b)!;
      if (na !== nb) return nb - na;
      const wa = t.wins.get(a)!;
      const wb = t.wins.get(b)!;
      if (wa !== wb) return wb - wa;
    } else {
      const ma = t.matchups.get(a)!;
      const mb = t.matchups.get(b)!;
      if (ma !== mb) return mb - ma;
      const forward =
        (t.h2h.get(a)?.get(b) ?? 0) - (t.h2h.get(b)?.get(a) ?? 0);
      if (forward !== 0) return -forward;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

export function rankFromDuels(
  itemIds: string[],
  duels: DuelRecord[],
  opts: RankOptions = {}
): RankedItem[] {
  const method = opts.method ?? "bradleyTerry";
  const prior = opts.prior ?? 1;

  const ids = [...new Set(itemIds ?? [])];
  const valid = new Set(ids);
  const deduped = dedupeDuels(duels ?? [], valid, opts.voterFilter);
  const t = tally(ids, deduped, opts.equalVoterWeight ?? true);

  const rated = ids.filter((id) => t.matchups.get(id)! > 0);
  const zeroDuel = ids.filter((id) => (t.matchups.get(id) ?? 0) === 0);

  let scores: Map<string, number>;
  let ratedSet: Set<string>;
  if (method === "copeland") {
    scores = copelandScores(ids, t);
    ratedSet = new Set(rated);
  } else if (method === "bradleyTerry") {
    const bt = bradleyTerry(rated, t, opts.btPrior ?? BT_PRIOR);
    scores = bt.strengths;
    ratedSet = bt.connected;
  } else {
    scores = winRateScores(rated, t, prior);
    ratedSet = new Set(rated);
  }

  const finalRated = rated.filter((id) => ratedSet.has(id));
  const stranded = rated.filter((id) => !ratedSet.has(id));
  const finalUnrated = [...zeroDuel, ...stranded].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  finalRated.sort(comparatorFor(method, scores, t));

  return [...finalRated, ...finalUnrated].map((id, i) => ({
    itemId: id,
    rank: i + 1,
    score: scores.get(id) ?? 0,
    wins: t.wins.get(id)!,
    losses: t.losses.get(id)!,
    matchups: t.matchups.get(id)!,
    rated: ratedSet.has(id),
  }));
}

/**
 * Re-order a ranking so "sink to the bottom" items — a Ranked Duels poll's
 * seen / hidden movies — fall below every other item, then renumber `rank`
 * over the result so the visible tier always reads 1..k on the cards.
 *
 * A movie marathon is the motivating case: mark the current #1 as watched and
 * the next film should immediately show the #1 badge. Both tiers keep their own
 * duel-derived order (the input order); only the tier boundary moves. A sunk
 * item that has real duels keeps `rated: true` and a real (bottom-of-list)
 * number; a never-dueled one was already last and stays last.
 *
 * Pure: `deprioritized` is a set of itemIds — this never needs to know what
 * "seen" or "hidden" mean (see poll-item-sort.pipe's `isDeprioritized`).
 */
export function sinkDeprioritized(
  ranking: RankedItem[],
  deprioritized: ReadonlySet<string>
): RankedItem[] {
  if (!deprioritized || deprioritized.size === 0) {
    return ranking;
  }
  const keep: RankedItem[] = [];
  const sink: RankedItem[] = [];
  for (const r of ranking) {
    (deprioritized.has(r.itemId) ? sink : keep).push(r);
  }
  if (sink.length === 0) {
    return ranking;
  }
  return [...keep, ...sink].map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * The single percentage to show next to an item's rank on its poll-item card.
 *
 * For the default Bradley–Terry method this is **not** the raw win rate — it's
 * the model's estimate of how often this item beats an average-strength one,
 * `p / (p + 1)` (BT strengths are normalised so the geometric mean is 1). That
 * keeps the number monotonic with the rank: a strong-schedule item on 50% raw
 * wins can outrank a weak-schedule item on 75%, and its shown percentage now
 * reflects that rather than contradicting it. Other methods fall back to the
 * plain `wins / matchups`.
 */
export function duelWinPercent(
  item: Pick<RankedItem, "score" | "wins" | "matchups" | "rated">,
  method: RankingMethod | null | undefined
): number {
  if (method === "bradleyTerry" && item.rated && item.score > 0) {
    return Math.round((100 * item.score) / (item.score + 1));
  }
  return item.matchups > 0 ? Math.round((item.wins / item.matchups) * 100) : 0;
}

/**
 * Pairs the group genuinely can't agree on: *both* sides have at least one
 * vote, and the margin between them is `<= margin` (default 1). A lopsided
 * result like 3–0 isn't contested (no disagreement); 2–1 and 1–1 are.
 * Respects `voterFilter`.
 */
export function contestedPairs(
  itemIds: string[],
  duels: DuelRecord[],
  opts: { voterFilter?: Set<string>; margin?: number } = {}
): [string, string][] {
  const margin = opts.margin ?? 1;
  const ids = [...new Set(itemIds ?? [])];
  const valid = new Set(ids);
  const t = tally(ids, dedupeDuels(duels ?? [], valid, opts.voterFilter));

  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const ab = t.h2h.get(a)?.get(b) ?? 0;
      const ba = t.h2h.get(b)?.get(a) ?? 0;
      if (Math.min(ab, ba) >= 1 && Math.abs(ab - ba) <= margin) out.push([a, b]);
    }
  }
  return out;
}

// --- pair selection ----------------------------------------------------------

/**
 * Default per-voter duel budget for an `itemCount`-item poll: `2 × n`, capped
 * at the full `C(n, 2)` pair count. One voter reaches a usable ranking in about
 * this many duels — a confident top and bottom, a softer middle — and the
 * middle then sharpens as more voters join (each contributing their own ~2n),
 * rather than any single person doing all `C(n, 2)` (120 for 16 items).
 */
export const TARGET_DUELS_MULTIPLIER = 2;

export function defaultTargetDuels(itemCount: number): number {
  const pairs = itemCount < 2 ? 0 : (itemCount * (itemCount - 1)) / 2;
  return Math.min(pairs, TARGET_DUELS_MULTIPLIER * itemCount);
}

/**
 * Comparisons a newly added item needs before its position means anything.
 *
 * Leave-one-out on the live 33-film poll (strip one film's duels, re-add it,
 * measure how far from its real slot it lands): 7.11 places at two duels, 6.69
 * at three, 6.25 at four, then a long flat tail. Three is where the curve stops
 * paying for itself against the time it costs.
 */
export const PLACEMENT_DUELS = 3;

/** This voter's own comparison count per item, over the current item set. */
function myComparisonCounts(ids: string[], myDuels: DuelRecord[]): Map<string, number> {
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const d of myDuels) {
    if (!counts.has(d.aId) || !counts.has(d.bId)) continue;
    counts.set(d.aId, counts.get(d.aId)! + 1);
    counts.set(d.bId, counts.get(d.bId)! + 1);
  }
  return counts;
}

/**
 * Items this voter has never compared — in practice, the films added after they
 * started duelling. Unambiguous by construction, which is what makes it safe to
 * drive the budget from: during a first run every item passes through this set
 * on its way in, but the budget gate isn't binding yet; by the end of a first
 * run the set is empty.
 */
export function unplacedItems(itemIds: string[], myDuels: DuelRecord[]): string[] {
  const ids = [...new Set(itemIds ?? [])];
  if (ids.length < 2) return [];
  const counts = myComparisonCounts(ids, myDuels ?? []);
  return ids.filter((id) => counts.get(id) === 0);
}

/**
 * Items this voter has compared fewer than `PLACEMENT_DUELS` times — what to
 * hand `nextPair` as `placeItems` once the caller has established that the
 * voter is past their first run. Wider than `unplacedItems`, which only knows
 * about items with no duels at all and therefore stops applying the moment a
 * new film has been shown once; placement has to survive until the film has
 * enough comparisons to actually sit somewhere.
 */
export function itemsNeedingPlacement(
  itemIds: string[],
  myDuels: DuelRecord[]
): string[] {
  const ids = [...new Set(itemIds ?? [])];
  if (ids.length < 2) return [];
  const counts = myComparisonCounts(ids, myDuels ?? []);
  return ids
    .filter((id) => counts.get(id)! < PLACEMENT_DUELS)
    .sort((a, b) => counts.get(a)! - counts.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The per-voter duel budget, including headroom to place `placeItems`.
 *
 * `defaultTargetDuels` alone grows by `TARGET_DUELS_MULTIPLIER` (2) per added
 * item, which is less than the `PLACEMENT_DUELS` (3) those items need — so a
 * voter who had finished could be cut off part-way through placing a new
 * arrival. The shortfall is added explicitly, from the same set the caller
 * hands `nextPair`, so the budget can't shrink back as the film accrues duels.
 * Clamped to the real pair count throughout.
 */
export function targetDuelsForVoter(
  itemIds: string[],
  myDuels: DuelRecord[],
  configuredTarget?: number | null,
  placeItems?: ReadonlySet<string>
): number {
  const ids = [...new Set(itemIds ?? [])];
  if (typeof configuredTarget === "number") return configuredTarget;
  const pairs = ids.length < 2 ? 0 : (ids.length * (ids.length - 1)) / 2;
  let headroom = 0;
  if (placeItems && placeItems.size) {
    const counts = myComparisonCounts(ids, myDuels ?? []);
    for (const id of ids) {
      if (placeItems.has(id)) {
        headroom += Math.max(0, PLACEMENT_DUELS - counts.get(id)!);
      }
    }
  }
  return Math.min(pairs, defaultTargetDuels(ids.length) + headroom);
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed || 1);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function allPairsOf(ids: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  }
  return pairs;
}

/** Union–find over `ids`, with path halving. */
function makeUnionFind(ids: string[]) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      const grand = parent.get(parent.get(x)!)!;
      parent.set(x, grand);
      x = grand;
    }
    return x;
  };
  return {
    find,
    union: (a: string, b: string) => parent.set(find(a), find(b)),
  };
}

/** Global head-to-head count per unordered pair, across every voter. */
function pairComparisonCounts(duels: DuelRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of duels ?? []) {
    if (!d || d.aId === d.bId) continue;
    const k = pairKey(d.aId, d.bId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

// Info-gain weighting (tuned against rank-from-duels.sim.spec.ts). Lower
// combined key = serve this pair next.
const W_CLOSENESS = 1; //   predicted win prob's distance from 50/50 — dominant
const W_SPARSITY = 0.4; //  penalty for a pair the group has already compared a lot
const JITTER = 0.15; //     decorrelates two voters off the single hottest pair

/**
 * The next matchup to serve `voterKey`, or `null` when their run is complete
 * (`targetDuelsPerVoter` reached, or every pair already done).
 *
 * Two stages:
 *  1. **Connectivity seed** — while the voter's own comparison graph doesn't
 *     yet span every item, serve a pair that joins two disconnected pieces of
 *     it. Guarantees the batch Bradley–Terry solver a connected graph within
 *     ~n−1 duels and stops stage 2 stranding items it never compares.
 *  2. **Information gain** (`"infoGain"`, default) — among the pairs this voter
 *     hasn't seen, serve the one that cuts the most uncertainty: closest
 *     current scores (predicted ≈ 50/50) first, then fewest global
 *     comparisons, plus a per-voter jitter so two people voting at once aren't
 *     both handed the single most-contested pair. `"coverage"` skips stage 2
 *     and walks a per-voter shuffle of what's left.
 *
 * `targetDuelsPerVoter` defaults to `defaultTargetDuels(n)`; pass a larger
 * number (or `Infinity`) for the "keep going to sharpen" opt-in. `exclude` is
 * a soft skip set ("too close — skip this pair"), ignored if honouring it
 * would leave nothing to serve. `allDuels` (every voter's records) feeds the
 * stage-2 sparsity term; omit it and stage 2 runs on closeness + jitter alone.
 */
export function nextPair(
  itemIds: string[],
  myDuels: DuelRecord[],
  ranking: RankedItem[],
  strategy: PairStrategy = "infoGain",
  voterKey = "",
  opts: {
    targetDuelsPerVoter?: number;
    exclude?: ReadonlySet<string>;
    allDuels?: DuelRecord[];
    /**
     * Items to place before refining anything else — the films this voter has
     * yet to compare after already working through the list. The caller decides
     * when that applies (it is the same condition the "N NEW FILMS" bar uses),
     * because only the caller can tell a late arrival from an item a first run
     * simply hasn't reached yet. Left out, pair selection behaves exactly as it
     * did before placement existed.
     */
    placeItems?: ReadonlySet<string>;
  } = {}
): [string, string] | null {
  const ids = [...new Set(itemIds ?? [])];
  if (ids.length < 2) return null;
  const idSet = new Set(ids);

  const mine = (myDuels ?? []).filter(
    (d) => d && d.aId !== d.bId && idSet.has(d.aId) && idSet.has(d.bId)
  );
  const donePairs = new Set(mine.map((d) => pairKey(d.aId, d.bId)));

  const remaining = allPairsOf(ids).filter(([a, b]) => !donePairs.has(pairKey(a, b)));
  if (remaining.length === 0) return null;

  const target = opts.targetDuelsPerVoter ?? defaultTargetDuels(ids.length);
  if (target > 0 && donePairs.size >= target) return null;

  const exclude = opts.exclude;
  const afterExclude =
    exclude && exclude.size > 0
      ? remaining.filter(([a, b]) => !exclude.has(pairKey(a, b)))
      : remaining;
  const pool = afterExclude.length > 0 ? afterExclude : remaining;

  // Per-voter deterministic order — the tiebreak for every stage below, and
  // `"coverage"`'s whole selection.
  const shuffled = seededShuffle(pool, hashString(voterKey));

  // Stage 0 — placement. A film the caller has flagged as newly added gets the
  // next duel, against whichever film is closest to it in current strength: a
  // binary-search probe rather than a coin toss against a random opponent. It
  // keeps priority until it has `PLACEMENT_DUELS` comparisons, because one duel
  // places nothing — on the live poll, four films added mid-run ended up with
  // 1, 2, 3 and 4 duels between them, and one is showing a confident-looking
  // rank off a single comparison.
  if (opts.placeItems && opts.placeItems.size > 0) {
    const mineCounts = myComparisonCounts(ids, mine);
    // An item with no duels has no meaningful score yet, but the prior puts it
    // at the field average — strength 1, the normalisation point — so that is
    // what it is compared against, not the literal 0 the ranking reports.
    const ranked = new Map((ranking ?? []).map((r) => [r.itemId, r]));
    const strengthOf = (id: string): number => {
      const r = ranked.get(id);
      return r && r.rated ? r.score : 1;
    };
    const pending = ids
      .filter((id) => opts.placeItems!.has(id) && mineCounts.get(id)! < PLACEMENT_DUELS)
      .sort((a, b) => mineCounts.get(a)! - mineCounts.get(b)! || (a < b ? -1 : a > b ? 1 : 0));

    for (const target of pending) {
      const candidates = ids.filter(
        (id) => id !== target && !donePairs.has(pairKey(target, id))
      );
      if (!candidates.length) continue;
      const mySc = strengthOf(target);
      let best = candidates[0];
      let bestGap = Infinity;
      for (const id of candidates) {
        const gap = Math.abs(strengthOf(id) - mySc);
        if (gap < bestGap || (gap === bestGap && id < best)) {
          bestGap = gap;
          best = id;
        }
      }
      return [target, best];
    }
  }

  // Stage 1 — connectivity seed.
  const uf = makeUnionFind(ids);
  for (const d of mine) uf.union(d.aId, d.bId);
  const spanning = new Set(ids.map((id) => uf.find(id))).size === 1;
  if (!spanning) {
    const connector = shuffled.find(([a, b]) => uf.find(a) !== uf.find(b));
    if (connector) return connector;
  }

  if (strategy === "coverage") return shuffled[0] ?? null;

  // Stage 2 — information gain.
  const score = new Map((ranking ?? []).map((r) => [r.itemId, r.score]));
  const counts = pairComparisonCounts(opts.allDuels ?? []);
  const maxCount = Math.max(1, ...counts.values());

  let best: [string, string] | null = null;
  let bestKey = Infinity;
  for (const [a, b] of shuffled) {
    const sa = score.get(a) ?? 0;
    const sb = score.get(b) ?? 0;
    // BT win prob for a over b is sa/(sa+sb); |that − 0.5| collapses to this.
    const closeness = sa + sb > 0 ? Math.abs(sa - sb) / (sa + sb) : 0;
    const sparsity = (counts.get(pairKey(a, b)) ?? 0) / maxCount;
    const jitter = JITTER * (hashString(voterKey + SEP + pairKey(a, b)) / 0xffffffff);
    const key = W_CLOSENESS * closeness + W_SPARSITY * sparsity + jitter;
    if (key < bestKey) {
      bestKey = key;
      best = [a, b];
    }
  }
  return best ?? shuffled[0] ?? null;
}
