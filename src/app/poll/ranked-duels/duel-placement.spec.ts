import { DuelRecord } from "./rank-from-duels";
import {
  isPastFirstRun,
  loadLatecomers,
  placementSet,
  saveLatecomers,
  withNewLatecomers,
} from "./duel-placement";

const duel = (a: string, b: string, i = 0): DuelRecord => ({ voterKey: "v", aId: a, bId: b, winnerId: a, ts: i });
const field = ["A", "B", "C", "D", "E"];
const allPairs = field.flatMap((a, i) => field.slice(i + 1).map((b, j) => duel(a, b, i * 10 + j)));

describe("duel placement", () => {
  const KEY = "duel-latecomers-p1-v";
  beforeEach(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem("duel-finished-p1-v");
  });
  afterEach(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem("duel-finished-p1-v");
  });

  it("persists latecomers per voter, and reads nothing for an unresolved voter", () => {
    saveLatecomers("p1", "v", ["N1", "N2"]);
    expect([...loadLatecomers("p1", "v")]).toEqual(["N1", "N2"]);
    expect(loadLatecomers("p1", "").size).toBe(0);
    saveLatecomers("p1", "", ["X"]);
    expect(localStorage.getItem("duel-latecomers-p1-")).toBeNull();
  });

  it("is past a first run once the finished flag is set", () => {
    expect(isPastFirstRun("p1", "v", 10, [])).toBe(false);
    localStorage.setItem("duel-finished-p1-v", "1");
    expect(isPastFirstRun("p1", "v", 10, [])).toBe(true);
  });

  it("is past a first run once a full budget of distinct pairs is done — measured over every item", () => {
    // 5 items: budget min(10, 10) = 10 pairs; 9 done is not enough.
    expect(isPastFirstRun("p1", "v", 5, allPairs.slice(0, 9))).toBe(false);
    expect(isPastFirstRun("p1", "v", 5, allPairs)).toBe(true);
    // Repeated picks of one pair don't add up to a budget.
    expect(isPastFirstRun("p1", "v", 5, Array.from({ length: 12 }, () => duel("A", "B")))).toBe(false);
  });

  it("only adds never-compared films as latecomers, and only past a first run", () => {
    const withNew = [...field, "NEW"];
    expect([...withNewLatecomers(new Set(), true, withNew, allPairs)]).toEqual(["NEW"]);
    expect(withNewLatecomers(new Set(), false, withNew, allPairs).size).toBe(0);
  });

  it("keeps a latecomer in the placement set until it has its duels", () => {
    const withNew = [...field, "NEW"];
    const one = [...allPairs, duel("NEW", "A", 99)];
    expect([...placementSet(new Set(["NEW"]), withNew, one)]).toEqual(["NEW"]);
    const enough = [...one, duel("NEW", "B", 100), duel("NEW", "C", 101)];
    expect(placementSet(new Set(["NEW"]), withNew, enough).size).toBe(0);
  });
});
