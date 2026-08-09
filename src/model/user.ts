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

export interface UserPreferences {
  condensedMovieView?: boolean;
  hideWatchedMovies?: boolean;
  useBackdropTheme?: boolean;
  theme?: 'light' | 'dark' | 'system';
  includeAdult?: boolean;
  letterboxFollowUsers?: string[];
  letterboxdMember?: LetterboxdMemberLink;
  // Defaults to shown (undefined/true) once a Letterboxd account is linked —
  // this only controls whether the Daily Reel Pace card renders in the
  // profile panel, not whether Letterboxd data itself is fetched.
  letterboxdShowGoal?: boolean;
  // Defaults to shown (undefined/true) once a Letterboxd account is linked —
  // controls whether the seen-progress ring renders in a movie poll's
  // header. Same private, viewer-only data as the seen badge; this only
  // toggles the ring's visibility, not the underlying lookup.
  letterboxdShowSeenRing?: boolean;
}

// Identifies the signed-in Poll-a-Lot user's own Letterboxd account, distinct
// from letterboxFollowUsers ("whose reviews I want to see"). `verified` is
// only ever true once linked via Letterboxd sign-in (OIDC) rather than by
// typing a username.
export interface LetterboxdMemberLink {
  lid: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  verified: boolean;
  linkedAt: number;
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
  preferences?: UserPreferences;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  updatedAt: number;
}
