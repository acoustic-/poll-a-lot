import { WatchlistItem } from "./tmdb";

export interface User {
  id?: string;
  name?: string;
  localUserId?: string;
  useSuffix?: number;
  // Runtime only — sourced from Firebase Auth on sign-in. NEVER persisted into a
  // poll's voters[]/creator/owner (see toUserRef in user-identity.ts, which
  // deliberately excludes it); it's written only to publicProfiles/{uid} and
  // resolved live at render time (see UserIdentityService).
  photoURL?: string;
}

export interface UserData {
  id: string;
  watchlist: WatchlistItem[];
  region: string;
  watchproviders: number[];
  latestPolls: { id: string; name: string }[];
  favoritePolls: { id: string; name: string }[];
  displayName?: string;          // overrides the Google displayName; mirrors publicProfiles/{uid}.displayName
  shareProfilePhoto?: boolean;   // default true (Google sign-in) — see PublicProfile
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  updatedAt: number;
}
