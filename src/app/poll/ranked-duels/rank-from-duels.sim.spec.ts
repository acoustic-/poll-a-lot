import {
  DuelRecord,
  defaultTargetDuels,
  nextPair,
  rankFromDuels,
} from "./rank-from-duels";

/**
 * Phase D — end-to-end simulation of the engine the way the app drives it:
 * latent-preference voters, `nextPair` picking each duel, `rankFromDuels`
 * (batch Bradley–Terry, the default) aggregating on demand.
 *
 * Validates the two properties the spec calls out:
 *  - order neutrality — shuffling the vote list yields the byte-identical
 *    ranking (no early vote carries more weight);
 *  - smooth convergence — the podium locks onto the ground truth as 1 → 2 → N
 *    voters join, each doing only ~`defaultTargetDuels(n)` duels, never the
 *    full `C(n, 2)`.
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Items `m0…m{n-1}` with linearly decreasing latent utility — ground-truth
 *  order is exactly `m0 > m1 > … `. */
function makeItems(n: number): { ids: string[]; utility: Map<string, number> } {
  const ids = Array.from({ length: n }, (_, i) => `m${i}`);
  const utility = new Map(ids.map((id, i) => [id, n - i]));
  return { ids, utility };
}

/** Simulate one voter running the real `nextPair` loop, picking per their
 *  (noisy) view of the latent utilities. Appends to `all`. */
function simulateVoter(
  ids: string[],
  utility: Map<string, number>,
  voterKey: string,
  all: DuelRecord[],
  noise: number,
  rand: () => number
): void {
  const mine: DuelRecord[] = [];
  const budget = defaultTargetDuels(ids.length);
  let guard = 0;
  let pair: [string, string] | null;
  while (
    (pair = nextPair(ids, mine, rankFromDuels(ids, all), "infoGain", voterKey, {
      targetDuelsPerVoter: budget,
      allDuels: all,
    })) &&
    guard++ < budget + 5
  ) {
    const [a, b] = pair;
    const ua = utility.get(a)! + (rand() - 0.5) * 2 * noise;
    const ub = utility.get(b)! + (rand() - 0.5) * 2 * noise;
    const winnerId = ua >= ub ? a : b;
    const rec = { voterKey, aId: a, bId: b, winnerId, ts: all.length + 1 };
    mine.push(rec);
    all.push(rec);
  }
}

const podium = (ids: string[], duels: DuelRecord[], k = 3) =>
  rankFromDuels(ids, duels)
    .slice(0, k)
    .map((r) => r.itemId);

describe("rank-from-duels simulation", () => {
  it("order neutrality: shuffling the vote list yields the identical ranking", () => {
    const { ids, utility } = makeItems(12);
    const all: DuelRecord[] = [];
    for (let v = 0; v < 4; v++) {
      simulateVoter(ids, utility, `voter-${v}`, all, 1.2, rng(1000 + v));
    }
    const baseline = JSON.stringify(rankFromDuels(ids, all));
    for (const seed of [1, 42, 99, 7777]) {
      const shuffled = all.slice();
      const rand = rng(seed);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(JSON.stringify(rankFromDuels(ids, shuffled)))
        .withContext(`shuffle seed ${seed}`)
        .toBe(baseline);
    }
  });

  it("a single voter (~2n duels) establishes a correct top and bottom", () => {
    const { ids, utility } = makeItems(16);
    const all: DuelRecord[] = [];
    simulateVoter(ids, utility, "solo", all, 0.6, rng(5));

    expect(all.length).toBe(defaultTargetDuels(16)); // 32, not C(16,2)=120
    const ranked = rankFromDuels(ids, all).map((r) => r.itemId);
    expect(ranked[0]).toBe("m0"); // best
    expect(ranked[ranked.length - 1]).toBe("m15"); // worst
    // Top-4 is the ground-truth top-4 as a set (interior order may wobble).
    expect(new Set(ranked.slice(0, 4))).toEqual(new Set(["m0", "m1", "m2", "m3"]));
  });

  it("the podium sharpens and stays correct as 1 → 2 → 5 voters join", () => {
    const { ids, utility } = makeItems(12);
    const truth = new Set(["m0", "m1", "m2"]);
    const all: DuelRecord[] = [];

    // One noisy voter (~2n duels): a roughly-right list, top pick in the
    // right neighbourhood but not guaranteed exact — that's the point of
    // pooling more voters.
    simulateVoter(ids, utility, "v0", all, 1.5, rng(11));
    expect(["m0", "m1"]).toContain(rankFromDuels(ids, all)[0].itemId);

    simulateVoter(ids, utility, "v1", all, 1.5, rng(22));
    const two = new Set(podium(ids, all));
    expect([...two].filter((x) => truth.has(x)).length).toBeGreaterThanOrEqual(2);

    for (let v = 2; v < 5; v++) {
      simulateVoter(ids, utility, `v${v}`, all, 1.5, rng(100 + v));
    }
    // Five voters -> the podium locks onto the ground truth.
    expect(new Set(podium(ids, all))).toEqual(truth);
    // Each voter did ~2n, so the pool is far below 5 × C(12,2) = 330.
    expect(all.length).toBeLessThanOrEqual(5 * defaultTargetDuels(12) + 5);
  });

  it("every item ends up rated (connectivity seeding keeps the BT graph joined)", () => {
    const { ids, utility } = makeItems(10);
    const all: DuelRecord[] = [];
    for (let v = 0; v < 3; v++) {
      simulateVoter(ids, utility, `v${v}`, all, 1.0, rng(300 + v));
    }
    expect(rankFromDuels(ids, all).every((r) => r.rated)).toBeTrue();
  });
});
