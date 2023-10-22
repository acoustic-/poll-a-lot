import { WatchlistItem } from "./tmdb";

export interface User {
  id?: string;
  name?: string;
  localUserId?: string;
}

export interface UserData {
  id: string;
  watchlist: WatchlistItem[];
  region: string;
  watchproviders: number[];
  latestPolls: { id: string; name: string }[];
}
