import { DuelBallot, duelProgress, flattenBallots } from "./duel";

function ballot(id: string, picks: DuelBallot["picks"]): DuelBallot {
  return { id, voterRef: { id }, updatedAt: 0, picks };
}

describe("flattenBallots", () => {
  it("stamps each pick with its ballot's id as voterKey", () => {
    const records = flattenBallots([
      ballot("v1", [
        { aId: "A", bId: "B", winnerId: "A", ts: 1 },
        { aId: "B", bId: "C", winnerId: "C", ts: 2 },
      ]),
      ballot("v2", [{ aId: "A", bId: "C", winnerId: "A", ts: 3 }]),
    ]);
    expect(records).toEqual([
      { voterKey: "v1", aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { voterKey: "v1", aId: "B", bId: "C", winnerId: "C", ts: 2 },
      { voterKey: "v2", aId: "A", bId: "C", winnerId: "A", ts: 3 },
    ]);
  });

  it("tolerates a null list, a ballot with no picks, and a missing id", () => {
    expect(flattenBallots(null as unknown as DuelBallot[])).toEqual([]);
    expect(flattenBallots([ballot("v1", undefined as unknown as DuelBallot["picks"])])).toEqual([]);
    const [rec] = flattenBallots([
      { voterRef: { name: "anon" }, updatedAt: 0, picks: [{ aId: "A", bId: "B", winnerId: "B", ts: 1 }] },
    ]);
    expect(rec.voterKey).toBe("");
  });
});

describe("duelProgress", () => {
  it("total is C(n,2) and done counts distinct valid pairs", () => {
    const p = duelProgress(["A", "B", "C", "D"], [
      { aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { aId: "C", bId: "D", winnerId: "C", ts: 2 },
    ]);
    expect(p).toEqual({ done: 2, total: 6 });
  });

  it("counts a pair once even if it was voted on twice (changed mind)", () => {
    const p = duelProgress(["A", "B"], [
      { aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { aId: "B", bId: "A", winnerId: "B", ts: 2 },
    ]);
    expect(p).toEqual({ done: 1, total: 1 });
  });

  it("ignores picks that reference an item no longer in the poll", () => {
    const p = duelProgress(["A", "B", "C"], [
      { aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { aId: "A", bId: "GONE", winnerId: "A", ts: 2 },
    ]);
    expect(p).toEqual({ done: 1, total: 3 });
  });

  it("never reports done > total as the item set shrinks under a live poll", () => {
    const picks = [
      { aId: "A", bId: "B", winnerId: "A", ts: 1 },
      { aId: "A", bId: "C", winnerId: "A", ts: 2 },
      { aId: "B", bId: "C", winnerId: "B", ts: 3 },
    ];
    // C was removed: only the A–B pair is still valid, total drops to 1.
    expect(duelProgress(["A", "B"], picks)).toEqual({ done: 1, total: 1 });
  });

  it("handles 0 and 1 item polls", () => {
    expect(duelProgress([], [])).toEqual({ done: 0, total: 0 });
    expect(duelProgress(["A"], [])).toEqual({ done: 0, total: 0 });
  });
});
