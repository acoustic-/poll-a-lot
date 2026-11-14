import { PairStrategy, RankingMethod } from "./rank-from-duels";

/** Number of steps in the first-time duel intro (sales pitch + three controls). */
export const INTRO_STEP_COUNT = 4;

/** Where a run's round count comes from, for the "how many rounds?" step. */
export type IntroRoundsSource = "configured" | "twoPerFilm" | "everyPair";

export interface IntroFacts {
  /** Films in play in this poll. */
  films: number;
  /** Rounds in a full run for this voter (the progress denominator). */
  rounds: number;
  roundsSource: IntroRoundsSource;
  method: RankingMethod;
  strategy: PairStrategy;
}

export interface IntroCopy {
  title: string;
  paragraphs: string[];
}

/**
 * Why a run is as long as it is: the poll's own per-voter setting, every pairing
 * (a small poll where 2 per film would exceed the pairs that exist), or the
 * default of 2 picks per film.
 */
export function introRoundsSource(films: number, rounds: number, configured: boolean): IntroRoundsSource {
  if (configured) return "configured";
  const pairs = films < 2 ? 0 : (films * (films - 1)) / 2;
  return rounds >= pairs ? "everyPair" : "twoPerFilm";
}

function pairingBlurb(strategy: PairStrategy): string {
  return strategy === "coverage"
    ? "in a shuffled order, so every film gets compared widely"
    : "to settle the closest calls first, so each of your picks teaches the most";
}

function scoringBlurb(method: RankingMethod): string {
  switch (method) {
    case "winRate":
      return "by win rate: the share of its duels each film wins";
    case "copeland":
      return "by head-to-head results: a film scores for every film it beats more often than it loses to";
    default:
      return "like a chess rating (Bradley–Terry): every pick is a win for one film, and everyone's picks combine into one strength score per film";
  }
}

function roundsParagraph(f: IntroFacts): string {
  switch (f.roundsSource) {
    case "configured":
      return `This poll's run is set to ${f.rounds} rounds, however many films it has (${f.films} right now).`;
    case "everyPair":
      return `This poll has only ${f.films} films, so ${f.rounds} rounds covers every possible pairing.`;
    default:
      return `This poll has ${f.films} films, so a full run is ${f.rounds} rounds: 2 picks for every film. A poll with more or fewer films has a different number.`;
  }
}

/** The card text for one step of the intro. Step 0 is the pitch; 1–3 each point
 *  at a control (the PICK buttons, the skip/undo row, the round counter). */
export function introStepCopy(step: number, facts: IntroFacts): IntroCopy {
  switch (step) {
    case 0:
      return {
        title: "Rank films by duelling",
        paragraphs: [
          "This poll uses duel voting: a fresh way to rank films without rating a single one. You just pick a winner between two.",
          `Pairs are chosen ${pairingBlurb(facts.strategy)}. Votes are scored ${scoringBlurb(facts.method)}.`,
        ],
      };
    case 1:
      return {
        title: "Pick your winner",
        paragraphs: ["Tap PICK THIS on the film you'd rather watch. Two films, one tap: that's a round."],
      };
    case 2:
      return {
        title: "Can't choose? Slipped?",
        paragraphs: [
          "Skip a pair that's too close to call. Once you've picked, Undo takes back your last pick, so a mis-tap costs nothing.",
        ],
      };
    default:
      return {
        title: "How many rounds?",
        paragraphs: [
          roundsParagraph(facts),
          "Your picks join everyone's to rank the poll. After that you can sharpen your own ratings; extra picks refine your list without moving the group's.",
        ],
      };
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A control the current step points at: the loop drawn round it, and the box a
 *  spotlight is cut out of the scrim for. */
export interface IntroMark {
  path: string;
  box: Box;
}

/**
 * An SVG path for a pen-like loop around `box`: a softly rounded ellipse that
 * spirals out a few pixels as it goes and overshoots its start, drawn as one
 * smooth cubic Bézier curve (Catmull-Rom through a dozen points), so there are
 * no corners to look blocky. Deterministic for a given `seed`.
 *
 * `bounds` fits the loop inside the dialog by shrinking its radii rather than
 * clamping points, which would flatten the curve against the edge — a control
 * spanning the full width is simply circled a touch inside it.
 */
export function scribbleCirclePath(
  box: Box,
  seed = 1,
  pad = 9,
  bounds?: { w: number; h: number }
): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const margin = 5;
  const drift = 0.045; // how far the pen has spiralled out by the end of the loop
  const fit = 1 + drift + 0.02;
  let rx = box.w / 2 + pad;
  let ry = box.h / 2 + pad;
  if (bounds) {
    rx = Math.min(rx, (Math.min(cx, bounds.w - cx) - margin) / fit);
    ry = Math.min(ry, (Math.min(cy, bounds.h - cy) - margin) / fit);
  }
  const turns = 1.06;
  const count = 14;
  const start = -2.4 + (seed % 5) * 0.18;
  const exponent = 2 / 2.6; // a little squarer than an ellipse, no sharper
  const pts: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = start + t * turns * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const radius = 1 + drift * t + 0.015 * Math.sin(angle * 2 + seed);
    pts.push([
      cx + Math.sign(c) * Math.abs(c) ** exponent * rx * radius,
      cy + Math.sign(s) * Math.abs(s) ** exponent * ry * radius,
    ]);
  }
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    d +=
      ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Which side of the arena the explainer card should sit on so it stays clear of
 *  the circled controls: the side with more free room, or the middle with none. */
export function introCardSide(boxes: Box[], containerHeight: number): "top" | "bottom" | "center" {
  if (!boxes.length || containerHeight <= 0) return "center";
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return top >= containerHeight - bottom ? "top" : "bottom";
}
