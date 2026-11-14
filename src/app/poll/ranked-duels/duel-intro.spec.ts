import {
  INTRO_STEP_COUNT,
  IntroFacts,
  introCardSide,
  introRoundsSource,
  introStepCopy,
  scribbleCirclePath,
} from "./duel-intro";

const facts = (over: Partial<IntroFacts> = {}): IntroFacts => ({
  films: 31,
  rounds: 62,
  roundsSource: "twoPerFilm",
  method: "bradleyTerry",
  strategy: "infoGain",
  ...over,
});

describe("introRoundsSource", () => {
  it("is 'configured' whenever the poll sets its own target", () => {
    expect(introRoundsSource(31, 20, true)).toBe("configured");
  });

  it("is 'twoPerFilm' for the default 2n", () => {
    expect(introRoundsSource(31, 62, false)).toBe("twoPerFilm");
  });

  it("is 'everyPair' when 2n would exceed the pairs that exist", () => {
    expect(introRoundsSource(3, 3, false)).toBe("everyPair");
    expect(introRoundsSource(2, 1, false)).toBe("everyPair");
  });
});

describe("introStepCopy", () => {
  it("opens with the pitch: how pairs are chosen and how votes are scored", () => {
    const copy = introStepCopy(0, facts());
    const text = copy.paragraphs.join(" ");
    expect(text).toContain("duel voting");
    expect(text).toContain("closest calls first");
    expect(text).toContain("Bradley–Terry");
  });

  it("describes the poll's own pairing strategy and scoring method", () => {
    const text = introStepCopy(0, facts({ strategy: "coverage", method: "winRate" })).paragraphs.join(" ");
    expect(text).toContain("shuffled order");
    expect(text).toContain("win rate");
    expect(introStepCopy(0, facts({ method: "copeland" })).paragraphs.join(" ")).toContain("head-to-head");
  });

  it("explains where the round count comes from, using this poll's film count", () => {
    const text = introStepCopy(3, facts()).paragraphs.join(" ");
    expect(text).toContain("31 films");
    expect(text).toContain("62 rounds");
    expect(text).toContain("2 picks for every film");
    expect(text).toContain("sharpen your own ratings");
  });

  it("says so when the poll set its own target, or when every pairing is covered", () => {
    expect(introStepCopy(3, facts({ roundsSource: "configured", rounds: 20 })).paragraphs[0]).toContain("set to 20 rounds");
    expect(introStepCopy(3, facts({ roundsSource: "everyPair", films: 3, rounds: 3 })).paragraphs[0]).toContain(
      "every possible pairing"
    );
  });

  it("has copy for every step", () => {
    for (let i = 0; i < INTRO_STEP_COUNT; i++) {
      const copy = introStepCopy(i, facts());
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.paragraphs.length).toBeGreaterThan(0);
    }
  });
});

describe("scribbleCirclePath", () => {
  const box = { x: 100, y: 200, w: 120, h: 40 };

  it("draws one smooth curve (no straight segments) around the box", () => {
    const path = scribbleCirclePath(box);
    expect(path.startsWith("M")).toBe(true);
    expect(path).not.toContain("L");
    expect(path.split("C").length).toBeGreaterThan(10);
    const nums = path.match(/-?\d+\.\d/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    // Reaches past every edge of the box, so the box is inside the loop.
    expect(Math.min(...xs)).toBeLessThan(box.x);
    expect(Math.max(...xs)).toBeGreaterThan(box.x + box.w);
    expect(Math.min(...ys)).toBeLessThan(box.y);
    expect(Math.max(...ys)).toBeGreaterThan(box.y + box.h);
  });

  it("stays inside the bounds it is given, even for a control spanning the full width", () => {
    const wide = { x: 0, y: 500, w: 400, h: 40 };
    const nums = scribbleCirclePath(wide, 1, 10, { w: 400, h: 540 }).match(/-?\d+\.\d/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    // Curve control points can sit a hair outside the curve itself.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(400);
    expect(Math.max(...ys)).toBeLessThanOrEqual(540);
  });

  it("is deterministic for a seed and varies between seeds", () => {
    expect(scribbleCirclePath(box, 2)).toBe(scribbleCirclePath(box, 2));
    expect(scribbleCirclePath(box, 2)).not.toBe(scribbleCirclePath(box, 3));
  });
});

describe("introCardSide", () => {
  it("sits at the side with more room", () => {
    expect(introCardSide([{ x: 0, y: 600, w: 100, h: 40 }], 700)).toBe("top");
    expect(introCardSide([{ x: 0, y: 10, w: 100, h: 40 }], 700)).toBe("bottom");
  });

  it("centres when there is nothing to avoid", () => {
    expect(introCardSide([], 700)).toBe("center");
  });
});
