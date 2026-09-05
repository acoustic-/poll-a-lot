import { duelCtaState } from "./duel-cta";

describe("duelCtaState", () => {
  it("start: no picks yet -> Start, with the budget (not C(n,2)) as the count", () => {
    const s = duelCtaState({ done: 0, total: 32 }, 88, 5, false);
    expect(s.kind).toBe("start");
    expect(s.headline).toBe("START DUELLING");
    expect(s.sub).toBe("32 match-ups, one pick each");
    expect(s.action).toBe("Start");
  });

  it("start: singular match-up copy for a 2-item poll", () => {
    expect(duelCtaState({ done: 0, total: 1 }, 0, 0, false).sub).toBe("1 match-up, one pick each");
  });

  it("start: a poll with fewer than two movies", () => {
    const s = duelCtaState({ done: 0, total: 0 }, 0, 0, false);
    expect(s.kind).toBe("start");
    expect(s.sub).toBe("Add more movies to duel");
    expect(s.action).toBe("About");
  });

  it("run: mid-run shows the viewer's own progress against the budget, never a roster", () => {
    const s = duelCtaState({ done: 6, total: 32 }, 88, 0, false);
    expect(s.kind).toBe("run");
    expect(s.headline).toBe("6 OF YOUR 32");
    expect(s.action).toBe("Continue");
    expect(s.sub).not.toMatch(/people|voters|waiting/i);
  });

  it("sharpen: budget reached but real pairs remain -> opt-in to keep going", () => {
    const s = duelCtaState({ done: 32, total: 32 }, 88, 0, false);
    expect(s.kind).toBe("sharpen");
    expect(s.headline).toBe("TOP LOOKS SOLID");
    expect(s.action).toBe("Keep going");
  });

  it("done: budget reached and every real pair covered (small poll) -> Redo", () => {
    const s = duelCtaState({ done: 6, total: 6 }, 0, 0, false);
    expect(s.kind).toBe("done");
    expect(s.headline).toBe("THAT'S A WRAP");
    expect(s.action).toBe("Redo");
  });

  it("done wins over sharpen once no pairs are left at all", () => {
    expect(duelCtaState({ done: 32, total: 32 }, 0, 0, false).kind).toBe("done");
  });

  it("nudge: finished before + new unplaced movies -> place them", () => {
    const s = duelCtaState({ done: 20, total: 32 }, 40, 2, true);
    expect(s.kind).toBe("nudge");
    expect(s.headline).toBe("2 NEW FILMS");
    expect(s.sub).toBe("~4 duels to place them");
    expect(s.action).toBe("Place");
  });

  it("nudge: singular film / duel copy", () => {
    const s = duelCtaState({ done: 31, total: 32 }, 1, 1, true);
    expect(s.headline).toBe("1 NEW FILM");
    expect(s.sub).toBe("~1 duel to place it");
  });

  it("nudge estimate is capped at how many pairs actually remain", () => {
    // 2 new films would be ~4 duels, but only 3 pairs are left.
    expect(duelCtaState({ done: 20, total: 32 }, 3, 2, true).sub).toBe("~3 duels to place them");
  });

  it("run (not nudge) when the voter never finished a prior run", () => {
    expect(duelCtaState({ done: 20, total: 32 }, 40, 2, false).kind).toBe("run");
  });

  it("run (not nudge) when there are no unplaced items", () => {
    expect(duelCtaState({ done: 20, total: 32 }, 40, 0, false).kind).toBe("run");
  });

  it("nudge via placedComplete: every pair among dueled movies is done, only new ones remain", () => {
    const s = duelCtaState({ done: 3, total: 8 }, 3, 1, false, true);
    expect(s.kind).toBe("nudge");
  });

  it("run (not nudge) when the voter is only part-way through the original set", () => {
    expect(duelCtaState({ done: 4, total: 10 }, 20, 1, false, false).kind).toBe("run");
  });

  it("budget-reached nudge beats sharpen when new movies are unplaced", () => {
    const s = duelCtaState({ done: 32, total: 32 }, 88, 2, false);
    expect(s.kind).toBe("nudge");
    expect(s.headline).toBe("2 NEW FILMS");
  });
});
