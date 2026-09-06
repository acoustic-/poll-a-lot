import {
  DuelRecord,
  RankingMethod,
  contestedPairs,
  defaultTargetDuels,
  duelWinPercent,
  nextPair,
  pairKey,
  rankFromDuels,
} from "./rank-from-duels";

/** Emit one DuelRecord per listed pair, with `winner` = whichever id the voter
 *  ranks higher in `order` (best -> worst). Models a voter tapping strictly per
 *  their private preference, no upsets. */
function duelsFor(
  voterKey: string,
  order: string[],
  pairs: [string, string][],
  startTs = 0
): DuelRecord[] {
  const rankOf = new Map(order.map((id, i) => [id, i]));
  return pairs.map(([a, b], i) => ({
    voterKey,
    aId: a,
    bId: b,
    winnerId: rankOf.get(a)! < rankOf.get(b)! ? a : b,
    ts: startTs + i,
  }));
}

function allPairs(ids: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
}

const order = (items: ReturnType<typeof rankFromDuels>) =>
  items.map((r) => r.itemId);

describe("rankFromDuels", () => {
  // --- Part A: 5 films, 4 voters, complete data (every voter answers all 10
  // pairs, no upsets). Private orders per the plan's worked example. The Borda
  // ground truth (= total pairwise wins) is C 13 · A 9 · E 7 · D 6 · B 5, i.e.
  // C > A > E > D > B. With complete deterministic data every method reproduces
  // it — the "D/E swap" the plan mentions is a Monte-Carlo noise artifact, not
  // a property of the clean fixture.
  const FILMS = ["A", "B", "C", "D", "E"];
  const PRIVATE: Record<string, string[]> = {
    V1: ["D", "A", "C", "E", "B"], // action
    V2: ["C", "B", "E", "A", "D"], // arthouse
    V3: ["E", "C", "A", "B", "D"], // crowd-pleaser
    V4: ["C", "A", "D", "B", "E"], // balanced
  };
  const completeDuels: DuelRecord[] = Object.entries(PRIVATE).flatMap(
    ([voter, ord], vi) => duelsFor(voter, ord, allPairs(FILMS), vi * 100)
  );

  it("head-to-head tallies match the hand-computed matrix", () => {
    const r = rankFromDuels(FILMS, completeDuels, { method: "winRate" });
    const by = new Map(r.map((x) => [x.itemId, x]));
    // Borda ground truth = total pairwise wins across all 4 voters.
    expect(by.get("C")!.wins).toBe(13);
    expect(by.get("A")!.wins).toBe(9);
    expect(by.get("E")!.wins).toBe(7);
    expect(by.get("D")!.wins).toBe(6);
    expect(by.get("B")!.wins).toBe(5);
    for (const id of FILMS) expect(by.get(id)!.matchups).toBe(16);
  });

  it("winRate reproduces the Borda podium C > A > E > D > B", () => {
    const r = rankFromDuels(FILMS, completeDuels, { method: "winRate" });
    expect(order(r)).toEqual(["C", "A", "E", "D", "B"]);
    expect(r.every((x) => x.rated)).toBeTrue();
    // Laplace-smoothed: (wins + 1) / (matchups + 2).
    expect(r[0].score).toBeCloseTo(14 / 18, 6); // C
    expect(r[4].score).toBeCloseTo(6 / 18, 6); // B
  });

  it("copeland reproduces C > A > E > D > B (C 4 · A 2.5 · E 1.5 · B 1 · D 1, D>B on margin)", () => {
    const r = rankFromDuels(FILMS, completeDuels, { method: "copeland" });
    expect(order(r)).toEqual(["C", "A", "E", "D", "B"]);
    const by = new Map(r.map((x) => [x.itemId, x.score]));
    expect(by.get("C")).toBe(4);
    expect(by.get("A")).toBe(2.5);
    expect(by.get("E")).toBe(1.5);
    expect(by.get("B")).toBe(1);
    expect(by.get("D")).toBe(1);
  });

  it("bradleyTerry reproduces the same podium and decreasing strengths", () => {
    const r = rankFromDuels(FILMS, completeDuels, { method: "bradleyTerry" });
    expect(order(r)).toEqual(["C", "A", "E", "D", "B"]);
    expect(r.every((x) => x.rated)).toBeTrue();
    for (let i = 1; i < r.length; i++)
      expect(r[i].score).toBeLessThanOrEqual(r[i - 1].score);
  });

  it("all three methods agree on the podium of the worked example", () => {
    const methods: RankingMethod[] = ["winRate", "copeland", "bradleyTerry"];
    for (const method of methods) {
      const top3 = order(rankFromDuels(FILMS, completeDuels, { method })).slice(
        0,
        3
      );
      expect(top3).withContext(method).toEqual(["C", "A", "E"]);
    }
  });

  // --- edge cases -----------------------------------------------------------

  it("all-ties: even splits leave every item at win rate 0.5, ordered by id", () => {
    const ids = ["A", "B", "C"];
    const pairs = allPairs(ids);
    const duels = [
      ...duelsFor("V1", ["A", "B", "C"], pairs, 0),
      ...duelsFor("V2", ["C", "B", "A"], pairs, 10),
    ];
    const r = rankFromDuels(ids, duels, { method: "winRate" });
    expect(order(r)).toEqual(["A", "B", "C"]);
    for (const x of r) {
      expect(x.wins).toBe(2);
      expect(x.losses).toBe(2);
      expect(x.score).toBeCloseTo(0.5, 6);
    }
  });

  it("single voter: a lone ballot still yields that voter's exact order", () => {
    const ids = ["A", "B", "C"];
    const duels = duelsFor("solo", ["B", "A", "C"], allPairs(ids));
    expect(order(rankFromDuels(ids, duels))).toEqual(["B", "A", "C"]);
  });

  it("two items: one duel decides the order and both are rated", () => {
    const r = rankFromDuels(
      ["A", "B"],
      [{ voterKey: "v", aId: "A", bId: "B", winnerId: "B", ts: 1 }]
    );
    expect(order(r)).toEqual(["B", "A"]);
    expect(r.every((x) => x.rated)).toBeTrue();
  });

  it("preference cycle: A>B>C>A resolves deterministically without throwing", () => {
    const ids = ["A", "B", "C"];
    const pairs = allPairs(ids);
    const duels = [
      ...duelsFor("V1", ["A", "B", "C"], pairs, 0),
      ...duelsFor("V2", ["B", "C", "A"], pairs, 10),
      ...duelsFor("V3", ["C", "A", "B"], pairs, 20),
    ];
    for (const method of ["winRate", "copeland", "bradleyTerry"] as RankingMethod[]) {
      const r = rankFromDuels(ids, duels, { method });
      expect(order(r)).withContext(method).toEqual(["A", "B", "C"]);
      for (const x of r) {
        expect(x.wins).toBe(3);
        expect(x.losses).toBe(3);
      }
    }
  });

  it("zero-duel item: an item with no matchups is unrated and sorted last", () => {
    const ids = ["A", "B", "C", "D"];
    const duels = duelsFor("V1", ["A", "B", "C"], allPairs(["A", "B", "C"]));
    const r = rankFromDuels(ids, duels);
    expect(order(r)).toEqual(["A", "B", "C", "D"]);
    const d = r.find((x) => x.itemId === "D")!;
    expect(d.rated).toBeFalse();
    expect(d.matchups).toBe(0);
    expect(d.rank).toBe(4);
    expect(r.filter((x) => x.rated).every((x) => x.rank < d.rank)).toBeTrue();
  });

  it("item added mid-run: it starts unrated, then folds into the order as it accrues duels", () => {
    const base = duelsFor("V1", ["A", "C", "B"], allPairs(["A", "B", "C"]), 0);

    const before = rankFromDuels(["A", "B", "C", "D"], base);
    expect(before.find((x) => x.itemId === "D")!.rated).toBeFalse();
    expect(order(before)).toEqual(["A", "C", "B", "D"]);

    // D now wins a couple of duels — it should graduate out of the unrated bucket.
    const withD: DuelRecord[] = [
      ...base,
      { voterKey: "V1", aId: "D", bId: "B", winnerId: "D", ts: 10 },
      { voterKey: "V1", aId: "D", bId: "C", winnerId: "D", ts: 11 },
    ];
    const after = rankFromDuels(["A", "B", "C", "D"], withD);
    const d = after.find((x) => x.itemId === "D")!;
    expect(d.rated).toBeTrue();
    expect(d.matchups).toBe(2);
    expect(d.rank).toBeLessThan(after.find((x) => x.itemId === "B")!.rank);
  });

  it("removed item: duels that reference an id not in itemIds are ignored", () => {
    const duels: DuelRecord[] = [
      { voterKey: "V1", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "V1", aId: "A", bId: "GHOST", winnerId: "GHOST", ts: 2 },
      { voterKey: "V1", aId: "GHOST", bId: "B", winnerId: "GHOST", ts: 3 },
    ];
    const r = rankFromDuels(["A", "B"], duels);
    expect(order(r)).toEqual(["A", "B"]);
    expect(r.find((x) => x.itemId === "A")!.matchups).toBe(1);
    expect(r.find((x) => x.itemId === "A")!.losses).toBe(0);
  });

  it("caps each voter to their most recent pick per pair (no ballot stuffing)", () => {
    const duels: DuelRecord[] = [
      { voterKey: "spammer", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "spammer", aId: "A", bId: "B", winnerId: "A", ts: 2 },
      { voterKey: "spammer", aId: "B", bId: "A", winnerId: "B", ts: 3 }, // changed their mind
      { voterKey: "other", aId: "A", bId: "B", winnerId: "A", ts: 1 },
    ];
    const r = rankFromDuels(["A", "B"], duels);
    const a = r.find((x) => x.itemId === "A")!;
    const b = r.find((x) => x.itemId === "B")!;
    // spammer's final pick is B>A; other's is A>B => 1-1, both 1 matchup each.
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(b.wins).toBe(1);
    expect(a.matchups).toBe(2);
  });

  it("voterFilter narrows the aggregate to the selected voters", () => {
    const r = rankFromDuels(FILMS, completeDuels, {
      method: "winRate",
      voterFilter: new Set(["V1"]),
    });
    // V1's private order is D > A > C > E > B.
    expect(order(r)).toEqual(["D", "A", "C", "E", "B"]);
    for (const x of r) expect(x.matchups).toBe(4);
  });

  it("bradleyTerry: an item stranded in a disconnected component is marked unrated", () => {
    // Two islands: {A,B} dueled, {C,D} dueled, nothing bridges them.
    const duels: DuelRecord[] = [
      { voterKey: "V1", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "V2", aId: "A", bId: "B", winnerId: "A", ts: 2 },
      { voterKey: "V3", aId: "A", bId: "B", winnerId: "A", ts: 3 },
      { voterKey: "V1", aId: "C", bId: "D", winnerId: "C", ts: 4 },
    ];
    const r = rankFromDuels(["A", "B", "C", "D"], duels, {
      method: "bradleyTerry",
    });
    // {A,B} is the larger component (3 matchups each) and stays rated.
    expect(r.find((x) => x.itemId === "A")!.rated).toBeTrue();
    expect(r.find((x) => x.itemId === "B")!.rated).toBeTrue();
    expect(r.find((x) => x.itemId === "C")!.rated).toBeFalse();
    expect(r.find((x) => x.itemId === "D")!.rated).toBeFalse();
    expect(order(r).slice(0, 2)).toEqual(["A", "B"]);
  });

  it("returns an empty list for no items and tolerates a null duel list", () => {
    expect(rankFromDuels([], null as unknown as DuelRecord[])).toEqual([]);
    expect(rankFromDuels(["A"], undefined as unknown as DuelRecord[]).length).toBe(1);
  });
});

describe("defaultTargetDuels", () => {
  it("is 2×n, capped at the full pair count for small polls", () => {
    expect(defaultTargetDuels(16)).toBe(32); // 2×16 < C(16,2)=120
    expect(defaultTargetDuels(12)).toBe(24);
    expect(defaultTargetDuels(4)).toBe(6); // 2×4=8 clamped to C(4,2)=6
    expect(defaultTargetDuels(3)).toBe(3);
    expect(defaultTargetDuels(1)).toBe(0);
  });
});

describe("nextPair", () => {
  /** Drive a whole run for one voter, returning the pairs served in order. */
  function runAll(
    ids: string[],
    strategy: "infoGain" | "coverage",
    voterKey: string,
    opts: { targetDuelsPerVoter?: number } = {},
    guardMax = 300
  ): [string, string][] {
    const mine: DuelRecord[] = [];
    const served: [string, string][] = [];
    let p: [string, string] | null;
    let guard = 0;
    while ((p = nextPair(ids, mine, rankFromDuels(ids, mine), strategy, voterKey, opts)) && guard++ < guardMax) {
      served.push(p);
      mine.push({ voterKey, aId: p[0], bId: p[1], winnerId: p[0], ts: guard });
    }
    return served;
  }

  it("coverage: serves every C(n,2) pair once, then null (n=3, target lifted)", () => {
    const served = runAll(["A", "B", "C"], "coverage", "v", { targetDuelsPerVoter: Infinity });
    const keys = served.map(([a, b]) => pairKey(a, b));
    expect(new Set(keys).size).toBe(3);
    expect(keys.length).toBe(3);
  });

  it("coverage: exhausts all 66 pairs for n=12 with no repeats (target lifted)", () => {
    const served = runAll(
      Array.from({ length: 12 }, (_, i) => `m${i}`),
      "coverage",
      "abc",
      { targetDuelsPerVoter: Infinity }
    );
    expect(new Set(served.map(([a, b]) => pairKey(a, b))).size).toBe(66);
    expect(served.length).toBe(66);
  });

  it("stops at defaultTargetDuels(n) when no target is given (16 items -> 32 duels)", () => {
    const served = runAll(Array.from({ length: 16 }, (_, i) => `m${i}`), "infoGain", "v");
    expect(served.length).toBe(32);
    // ...and every pair served was distinct.
    expect(new Set(served.map(([a, b]) => pairKey(a, b))).size).toBe(32);
  });

  it("is deterministic per voterKey and differs between voters", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const first = () => nextPair(ids, [], [], "coverage", "alice");
    expect(first()).toEqual(first());
    expect(nextPair(ids, [], [], "coverage", "alice")).not.toEqual(
      nextPair(ids, [], [], "coverage", "zoe")
    );
  });

  it("never re-serves a pair the voter already picked (either order)", () => {
    const ids = ["A", "B", "C", "D"];
    const mine: DuelRecord[] = [
      { voterKey: "v", aId: "B", bId: "A", winnerId: "A", ts: 1 }, // done, reversed
      { voterKey: "v", aId: "C", bId: "D", winnerId: "C", ts: 2 },
    ];
    for (let i = 0; i < 6; i++) {
      const p = nextPair(ids, mine, rankFromDuels(ids, mine), "infoGain", "v", { targetDuelsPerVoter: Infinity });
      if (!p) break;
      expect(["A|B", "C|D"]).not.toContain(pairKey(p[0], p[1]));
      mine.push({ voterKey: "v", aId: p[0], bId: p[1], winnerId: p[0], ts: 10 + i });
    }
  });

  it("explicit targetDuelsPerVoter stops the stream once reached", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const mine: DuelRecord[] = [
      { voterKey: "v", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "v", aId: "A", bId: "C", winnerId: "A", ts: 2 },
      { voterKey: "v", aId: "A", bId: "D", winnerId: "A", ts: 3 },
    ];
    expect(nextPair(ids, mine, [], "coverage", "v", { targetDuelsPerVoter: 3 })).toBeNull();
    expect(nextPair(ids, mine, [], "coverage", "v", { targetDuelsPerVoter: 5 })).not.toBeNull();
  });

  it("returns null when there are fewer than two items", () => {
    expect(nextPair([], [], [], "coverage", "v")).toBeNull();
    expect(nextPair(["A"], [], [], "coverage", "v")).toBeNull();
  });

  it("connectivity seed: the first n−1 duels leave the voter's own graph fully connected", () => {
    const ids = ["A", "B", "C", "D", "E", "F"];
    const mine: DuelRecord[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const p = nextPair(ids, mine, rankFromDuels(ids, mine), "infoGain", "v")!;
      mine.push({ voterKey: "v", aId: p[0], bId: p[1], winnerId: p[0], ts: i });
    }
    // Union-find over what the voter has compared: one component.
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const d of mine) parent.set(find(d.aId), find(d.bId));
    expect(new Set(ids.map(find)).size).toBe(1);
  });

  it("look-ahead: the pair served after a pick doesn't depend on who won it", () => {
    // The duel view warms the *next* pair's movie detail by calling nextPair
    // with a synthetic pick for the current pair. This only works if the
    // winnerId of that synthetic pick is irrelevant — pin that here.
    const ids = ["A", "B", "C", "D", "E"];
    const mine: DuelRecord[] = [
      { voterKey: "v", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "v", aId: "C", bId: "D", winnerId: "C", ts: 2 },
    ];
    const ranking = rankFromDuels(ids, mine);
    const current: [string, string] = nextPair(ids, mine, ranking, "infoGain", "v", {
      targetDuelsPerVoter: Infinity,
    })!;
    const predictWith = (winnerId: string) =>
      nextPair(
        ids,
        [...mine, { voterKey: "v", aId: current[0], bId: current[1], winnerId, ts: 3 }],
        ranking,
        "infoGain",
        "v",
        { targetDuelsPerVoter: Infinity }
      );
    expect(predictWith(current[0])).toEqual(predictWith(current[1]));
  });

  it("infoGain: once seeded, prefers the pair whose current scores are closest", () => {
    const ids = ["A", "B", "C", "D"];
    // Spanning graph already in place; A≈B (near-tie), C and D far apart.
    const mine: DuelRecord[] = [
      { voterKey: "v", aId: "A", bId: "C", winnerId: "A", ts: 1 },
      { voterKey: "v", aId: "C", bId: "D", winnerId: "C", ts: 2 },
      { voterKey: "v", aId: "B", bId: "D", winnerId: "B", ts: 3 },
    ];
    // Global data making A and B almost equal in strength, D clearly weakest.
    const allDuels: DuelRecord[] = [
      ...mine,
      { voterKey: "w", aId: "A", bId: "B", winnerId: "A", ts: 4 },
      { voterKey: "x", aId: "B", bId: "A", winnerId: "B", ts: 5 },
      { voterKey: "w", aId: "A", bId: "D", winnerId: "A", ts: 6 },
      { voterKey: "x", aId: "B", bId: "C", winnerId: "B", ts: 7 },
    ];
    const ranking = rankFromDuels(ids, allDuels);
    const p = nextPair(ids, mine, ranking, "infoGain", "v", { allDuels, targetDuelsPerVoter: Infinity })!;
    expect(pairKey(p[0], p[1])).toBe("A|B"); // the only unseen pair, and the closest
  });

  it("infoGain: with no ranking yet, still returns a valid unseen pair", () => {
    const p = nextPair(["A", "B", "C"], [], [], "infoGain", "v");
    expect(p).not.toBeNull();
    expect(["A|B", "A|C", "B|C"]).toContain(pairKey(p![0], p![1]));
  });

  it("re-engagement: with the cap lifted, every missing new-item pair is served", () => {
    const ids = ["A", "B", "C", "D"];
    const mine: DuelRecord[] = [
      { voterKey: "v", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "v", aId: "A", bId: "C", winnerId: "A", ts: 2 },
      { voterKey: "v", aId: "B", bId: "C", winnerId: "B", ts: 3 },
    ];
    for (let i = 0; i < 3; i++) {
      const p = nextPair(ids, mine, rankFromDuels(ids, mine), "infoGain", "v", { targetDuelsPerVoter: Infinity });
      expect(p).not.toBeNull();
      expect(p!).withContext("every remaining pair involves the new item D").toContain("D");
      const other = p!.find((x) => x !== "D")!;
      mine.push({ voterKey: "v", aId: "D", bId: other, winnerId: other, ts: 10 + i });
    }
    expect(
      nextPair(ids, mine, [], "infoGain", "v", { targetDuelsPerVoter: Infinity })
    ).toBeNull();
  });

  it("exclude: parks a 'skipped' pair for the session, but never strands the voter", () => {
    const ids = ["A", "B", "C"];
    const first = nextPair(ids, [], [], "coverage", "skipper")!;
    const firstKey = pairKey(first[0], first[1]);
    const second = nextPair(ids, [], [], "coverage", "skipper", { exclude: new Set([firstKey]) })!;
    expect(pairKey(second[0], second[1])).not.toBe(firstKey);
    const all = new Set(["A B", "A C", "B C"].map((s) => pairKey(...(s.split(" ") as [string, string]))));
    expect(nextPair(ids, [], [], "coverage", "skipper", { exclude: all })).not.toBeNull();
  });

  it("exclude: an empty set behaves exactly like no exclude set", () => {
    const ids = ["A", "B", "C", "D"];
    const plain = nextPair(ids, [], [], "coverage", "v");
    const withEmpty = nextPair(ids, [], [], "coverage", "v", { exclude: new Set() });
    expect(withEmpty).toEqual(plain);
  });
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("A", "B")).toBe(pairKey("B", "A"));
    expect(pairKey("A", "B")).not.toBe(pairKey("A", "C"));
  });
});

describe("duelWinPercent", () => {
  it("Bradley-Terry: derives the % from strength so it tracks the rank, not raw wins", () => {
    // Five voters, all agree A > B; B racks up easy wins over a weak C/D pool.
    const ids = ["A", "B", "C", "D"];
    const duels: DuelRecord[] = [];
    for (let v = 0; v < 5; v++) {
      duels.push({ voterKey: `v${v}`, aId: "A", bId: "B", winnerId: "A", ts: v });
      for (const loser of ["C", "D"]) {
        duels.push({ voterKey: `v${v}`, aId: "B", bId: loser, winnerId: "B", ts: v });
        duels.push({ voterKey: `v${v}`, aId: "A", bId: loser, winnerId: "A", ts: v });
      }
    }
    const ranking = rankFromDuels(ids, duels, { method: "bradleyTerry" });
    const byId = new Map(ranking.map((r) => [r.itemId, r]));
    const a = byId.get("A")!;
    const b = byId.get("B")!;
    // A is ranked above B...
    expect(a.rank).toBeLessThan(b.rank);
    // ...and its shown percentage is too, even though B also never lost a duel
    // it "should" have. Both are monotonic with the BT strength.
    expect(duelWinPercent(a, "bradleyTerry")).toBeGreaterThan(
      duelWinPercent(b, "bradleyTerry")
    );
  });

  it("falls back to raw wins / matchups for non-BT methods and unrated items", () => {
    expect(duelWinPercent({ score: 0.9, wins: 3, matchups: 4, rated: true }, "winRate")).toBe(75);
    expect(duelWinPercent({ score: 0, wins: 0, matchups: 0, rated: false }, "bradleyTerry")).toBe(0);
  });
});

describe("contestedPairs", () => {
  const rec = (voterKey: string, a: string, b: string, w: string, ts = 1): DuelRecord => ({
    voterKey, aId: a, bId: b, winnerId: w, ts,
  });

  it("flags a pair split within one vote, and a dead tie", () => {
    const duels = [
      // A vs B: 2–1 (within one) -> contested
      rec("v1", "A", "B", "A"), rec("v2", "A", "B", "A"), rec("v3", "A", "B", "B"),
      // A vs C: 3–0 (clear) -> not contested
      rec("v1", "A", "C", "A"), rec("v2", "A", "C", "A"), rec("v3", "A", "C", "A"),
      // B vs C: 1–1 tie -> contested
      rec("v1", "B", "C", "B"), rec("v2", "B", "C", "C"),
    ];
    const pairs = contestedPairs(["A", "B", "C"], duels).map(([a, b]) => pairKey(a, b));
    expect(pairs).toContain(pairKey("A", "B"));
    expect(pairs).toContain(pairKey("B", "C"));
    expect(pairs).not.toContain(pairKey("A", "C"));
  });

  it("a one-sided result is not contested (no disagreement, just little data)", () => {
    // A vs B seen only once (1–0), B vs C is 2–0.
    const duels = [
      rec("v1", "A", "B", "A"),
      rec("v1", "B", "C", "B"), rec("v2", "B", "C", "B"),
    ];
    expect(contestedPairs(["A", "B", "C"], duels)).toEqual([]);
  });

  it("respects the voter filter", () => {
    const duels = [
      rec("k1", "A", "B", "A"), rec("k2", "A", "B", "B"), // 1–1 within the {k1,k2} filter
      rec("d1", "A", "B", "A"), rec("d2", "A", "B", "A"), // overall it's 3–1
    ];
    expect(contestedPairs(["A", "B"], duels).length).toBe(0); // unfiltered: 3–1, not contested
    expect(
      contestedPairs(["A", "B"], duels, { voterFilter: new Set(["k1", "k2"]) }).length
    ).toBe(1);
  });
});
