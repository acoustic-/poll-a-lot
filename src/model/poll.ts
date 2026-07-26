import { MovieIndex, MoviePollItemData } from "./tmdb";
import { User } from "./user";

export interface Poll {
  id: string;
  name: string;
  owner: User;
  created: Date;
  theme: PollThemesEnum;
  selectMultiple: boolean;
  allowAdd?: boolean;
  moviepoll?: boolean;
  seriesPoll?: boolean;
  showPollItemCreators?: boolean;
  useSeenReaction?: boolean;
  description?: string;
  date?: { seconds: number, nanoseconds: number };
  movieList?: boolean;
  rankedMovieList?: boolean;
  locked?: { seconds: number, nanoseconds: number };
  descriptionAI?: string;
  pointVoting?: PollPointVoting;
}

export interface PollPointVoting {
  pointVoting?: boolean;            // default/undefined = off, binary voting as today
  pointVotingBudget?: number;       // points per voter; falls back to DEFAULT_POINT_VOTING_BUDGET (poll-item.service.ts) when pointVoting is on and unset
  pointVotingMaxPerItem?: number;   // undefined = unlimited; else 1..pointVotingBudget
}

export interface PollItem {
  id: string;
  pollId: string; // parent id
  name: string;
  created: string;
  voters: Array<User & { timestamp: number; points?: number }>;
  movieId?: number;
  movieIndex?: MovieIndex;
  moviePollItemData?: MoviePollItemData;
  order: number;

  seriesId?: number;
  creator?: User;
  reactions?: { label: string; users: User[] }[];
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
