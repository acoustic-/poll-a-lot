import { MovieIndex, MoviePollItemData } from "./tmdb";
import { User } from "./user";

export interface Poll {
  id: string;
  name: string;
  owner: User;
  created: Date;
  pollItems: PollItem[];
  theme: PollThemesEnum;
  selectMultiple: boolean;
  allowAdd?: boolean;
  moviepoll?: boolean;
  seriesPoll?: boolean;
  showPollItemCreators?: boolean;
  useSeenReaction?: boolean;
}

export interface PollItem {
  id: string;
  name: string;
  created: string;
  voters: Array<User & { timestamp: number }>;
  movieId?: number;
  movieIndex?: MovieIndex;
  moviePollItemData?: MoviePollItemData;

  seriesId?: number;
  creator?: User;
  reactions?: { label: string; users: User[] }[];
  description?: string;
  tags?: string[];
}

export enum PollThemesEnum {
  default = "DEFAULT",
  dark = "DARK",
  light = "LIGHT",
  rainbow = "RAINBOW",
}
