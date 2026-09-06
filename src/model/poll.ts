import { MovieIndex, MoviePollItemData } from "./tmdb";
import { UserRef } from "../app/user-identity";
import { PairStrategy, RankingMethod } from "../app/poll/ranked-duels/rank-from-duels";

export interface Poll {
  id: string;
  name: string;
  owner: UserRef;
  created: Date;
  theme: PollThemesEnum;
  selectMultiple: boolean;
  allowAdd?: boolean;
  moviepoll?: boolean;
  seriesPoll?: boolean;
  showPollItemCreators?: boolean;
  useSeenReaction?: boolean;
  description?: string;
  // Firestore round-trips a written `Date` back as `{seconds, nanoseconds}`,
  // so a freshly-assigned value (e.g. from a datepicker) is a `Date` until
  // the next read — both shapes are legitimate depending on where in that
  // lifecycle the value is read.
  date?: Date | { seconds: number, nanoseconds: number };
  movieList?: boolean;
  rankedMovieList?: boolean;
  locked?: Date | { seconds: number, nanoseconds: number } | null;
  descriptionAI?: string;
  pointVoting?: PollPointVoting;
  duelVoting?: DuelVoting;
}

export interface PollPointVoting {
  pointVoting?: boolean;            // default/undefined = off, binary voting as today
  pointVotingBudget?: number;       // points per voter; falls back to DEFAULT_POINT_VOTING_BUDGET (poll-item.service.ts) when pointVoting is on and unset
  pointVotingMaxPerItem?: number;   // undefined = unlimited; else 1..pointVotingBudget
}

// Ranked Duels: voters answer a stream of 1-on-1 matchups over the poll's
// existing movie set; every voter's pairwise picks aggregate into one combined
// ranked list (Flickchart-style). Mutually exclusive with `pointVoting` — each
// toggle clears the other. Picks live in a `polls/{id}/duelBallots/{voterKey}`
// subcollection (one ballot doc per voter), not on the poll doc.
export interface DuelVoting {
  duels?: boolean;                    // undefined/false = off
  rankingMethod?: RankingMethod;      // default 'bradleyTerry' (batch MLE, order-independent)
  pairStrategy?: PairStrategy;        // default 'infoGain'
  // Soft per-voter budget: once a voter has this many picks the bar switches
  // to "keep going to sharpen?" (an opt-in, not a hard stop). Unset =>
  // `defaultTargetDuels(n)` ≈ 2 × item-count, capped at C(n, 2).
  targetDuelsPerVoter?: number;
}

export interface PollItem {
  id: string;
  pollId: string; // parent id
  name: string;
  created: string;
  voters: (UserRef & { timestamp: number; points?: number })[];
  movieId?: number;
  movieIndex?: MovieIndex;
  moviePollItemData?: MoviePollItemData;
  order: number;

  seriesId?: number;
  creator?: UserRef;
  reactions?: { label: string; users: UserRef[] }[];
  description?: string;
  tags?: string[];

  visible?: boolean;
  selected?: boolean;

  suggestionAI?: { text: string, order?: number };
}

export interface PollSuggestion {
  order: number,
  prompt: string,
  suggestion: string | undefined
}

export enum PollThemesEnum {
  default = "DEFAULT",
  dark = "DARK",
  light = "LIGHT",
  rainbow = "RAINBOW",
}
