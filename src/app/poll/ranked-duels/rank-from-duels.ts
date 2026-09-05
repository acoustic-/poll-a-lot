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
  /** When set, only records whose `voterKey` is in the set are counted. */
  voterFilter?: Set<string>;
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

function tally(itemIds: string[], duels: DuelRecord[]): Tally {
  const wins = new Map(itemIds.map((id) => [id, 0]));
  const losses = new Map(itemIds.map((id) => [id, 0]));
  const matchups = new Map(itemIds.map((id) => [id, 0]));
  const h2h = new Map(itemIds.map((id) => [id, new Map<string, number>()]));

  for (const d of duels) {
    const winner = d.winnerId;
    const loser = d.winnerId === d.aId ? d.bId : d.aId;
    wins.set(winner, wins.get(winner)! + 1);
    losses.set(loser, losses.get(loser)! + 1);
    matchups.set(winner, matchups.get(winner)! + 1);
    matchups.set(loser, matchups.get(loser)! + 1);
    const row = h2h.get(winner)!;
    row.set(loser, (row.get(loser) ?? 0) + 1);
  }
  return { wins, losses, matchups, h2h };
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
 * Bradley–Terry strengths via MM / Zermelo iteration (fine for n ≤ ~12). Also
 * returns the set of items that are actually comparable: an item stranded in a
 * component disconnected from the main body of duels can't be placed on the
 * same scale, so it is handed back as `rated: false` rather than given a
 * meaningless strength.
 */
function bradleyTerry(
  rated: string[],
  t: Tally
): { strengths: Map<string, number>; connected: Set<string> } {
  const n = rated.length;
  if (n === 0) return { strengths: new Map(), connected: new Set() };

  const idx = new Map(rated.map((id, i) => [id, i]));
  const N: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const winnerId of rated) {
    const i = idx.get(winnerId)!;
    for (const [loserId, c] of t.h2h.get(winnerId)!) {
      const j = idx.get(loserId);
      if (j === undefined) continue;
      N[i][j] += c;
      N[j][i] += c;
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

  const W = rated.map((id) => t.wins.get(id)!);
  let p = new Array(n).fill(1);
  for (let iter = 0; iter < 200; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (j === i || N[i][j] === 0) continue;
        denom += N[i][j] / (p[i] + p[j]);
      }
      next[i] = denom > 0 ? W[i] / denom : 0;
    }
    const positive = next.filter((v) => v > 0);
    if (positive.length) {
      const gm = Math.exp(
        positive.reduce((s, v) => s + Math.log(v), 0) / positive.length
      );
      for (let i = 0; i < n; i++) next[i] /= gm;
    }
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
  const t = tally(ids, deduped);

  const rated = ids.filter((id) => t.matchups.get(id)! > 0);
  const zeroDuel = ids.filter((id) => t.matchups.get(id)! === 0);

  let scores: Map<string, number>;
  let ratedSet: Set<string>;
  if (method === "copeland") {
    scores = copelandScores(ids, t);
    ratedSet = new Set(rated);
  } else if (method === "bradleyTerry") {
    const bt = bradleyTerry(rated, t);
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
): Array<[string, string]> {
  const margin = opts.margin ?? 1;
  const ids = [...new Set(itemIds ?? [])];
  const valid = new Set(ids);
  const t = tally(ids, dedupeDuels(duels ?? [], valid, opts.voterFilter));

  const out: Array<[string, string]> = [];
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

function allPairsOf(ids: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
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
