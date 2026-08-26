import { LetterboxdItem, LetterboxdSeenInfo } from "./letterboxd";

export interface TMDbMovieResponse {
  readonly page: number;
  readonly results: TMDbMovie[];
  readonly total_results: number;
  readonly total_pages: number;
}

export interface TMDbMovie {
  readonly poster_path?: string;
  readonly adult: boolean;
  readonly overview: string;
  readonly release_date: string;
  readonly genres: { id: number; name: string }[];
  readonly id: number;
  readonly imdb_id?: string;
  readonly original_title: string;
  readonly production_countries: { name: string }[];
  readonly title: string;
  readonly backdrop_path: string | null;
  readonly popularity: number;
  readonly vote_count: number;
  readonly video: boolean;
  readonly vote_average: number;
  readonly runtime?: number;
  readonly tagline?: string;
  readonly credits: {
    cast: Cast[];
    crew: Crew[];
  };
  readonly images: {
    backdrops: { file_path: string | null }[];
  };
  readonly recommendations: Recommendation;
  readonly keywords?: { keywords: { id: number; name: string }[] };
  readonly videos?: { results: { key: string; type: string }[] };
  readonly belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  };
  release_dates: {results: {iso_3166_1: string, release_dates: {certification: string, release_date?: string}[]}[]}
}

export type MovieSearchResultView = Pick<
  TMDbMovie,
  "id" | "title" | "original_title" | "release_date" | "poster_path" | "vote_average"
>;

// TMDB's /collection/{id} response — "parts" are lightweight movie
// summaries, not full TMDbMovie objects (no credits/images/etc.).
export interface MovieCollection {
  readonly id: number;
  readonly name: string;
  readonly overview: string;
  readonly poster_path: string | null;
  readonly backdrop_path: string | null;
  readonly parts: Pick<TMDbMovie, "id" | "title" | "poster_path" | "release_date" | "vote_average">[];
}

export interface RecentSearchItem extends MovieSearchResultView {
  readonly searchedAt: number;
}

// OMDb API (omdbapi.com) response shape — only the fields this app actually
// reads (Ratings for imdb/metacritic/rotten-tomatoes scores, Country for
// production-country.pipe.ts's OMDb-preferred country list).
export interface OMDbMovie {
  readonly Ratings?: { Source: string; Value: string }[];
  readonly Country?: string;
}

interface MoviePrototype {
  readonly posterUrl: string | null;
  readonly posterPath: string | null;
  readonly overview: string;
  readonly releaseDate: string;
  readonly genres: string[];
  readonly id: number;
  readonly imdbId?: string;
  readonly originalTitle: string;
  readonly title: string;
  readonly tagline?: string;
  readonly backdropUrl: string | null;
  readonly backdropPath: string | null;
  readonly popularity: number;
  readonly voteCount: number;
  readonly tmdbRating: number;
  readonly runtime?: number;
  readonly credits: {
    cast: Cast[];
    crew: Crew[];
  };
  readonly omdbMovie?: OMDbMovie;
  readonly originalObject: TMDbMovie;
  readonly recommendations: Recommendation;
  readonly productionCountries: { name: string }[];
}

export interface ExtraRating {
  // OMDb returns this as a string (e.g. "8.4/10") — movie-dialog.html's
  // `imdbRating?.split("/")[0]` display logic depends on it being one.
  readonly imdbRating: string;
  readonly metaRating: string;
  readonly rottenRating: string;
  readonly letterboxdRating: number;
}

export interface Movie extends MoviePrototype, Partial<ExtraRating> {
  letterboxdItem?: LetterboxdItem,
  // The viewer's own "already watched" status, private and never persisted
  // to Firestore or shown to other voters.
  letterboxdSeen?: LetterboxdSeenInfo,
  watchProviders?: WatchProviders,
}

export interface TMDbSeriesResponse {
  readonly page: number;
  readonly results: TMDbSeries[];
  readonly total_results: number;
  readonly total_pages: number;
}

export interface TMDbSeries {
  readonly poster_path?: string;
  readonly overview: string;
  readonly release_date: string;
  readonly genres: { id: number; name: string }[];
  readonly id: number;
  readonly imdb_id?: string;
  readonly original_name: string;
  readonly name: string;
  readonly backdrop_path?: string;
  readonly popularity: number;
  readonly vote_count: number;
  readonly video: boolean;
  readonly vote_average: number;
  readonly episode_run_time?: number;
  readonly number_of_episodes?: number;
  readonly number_of_seasons?: number;
  readonly first_air_date?: string;
  readonly last_air_date?: string;
  readonly in_production?: boolean;
}

export interface Cast {
  adult: boolean;
  gender: 1 | 2;
  known_for_department: "Acting";
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string;
  character: string;
  order: number;
}

export interface Crew {
  adult: boolean;
  gender: 1 | 2;
  known_for_department: "Directing" | "Writing";
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string;
  department: "Directing" | "Writing";
  job: string;
}

export interface Recommendation {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}

export interface WatchService {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface WatchProviders {
  id: number;
  // Keyed by ISO 3166-1 country code (e.g. "FI", "US") — TMDB's real
  // /movie/{id}/watch/providers response shape, not an array.
  results: Record<string, {
    link: string;
    rent?: WatchService[];
    buy?: WatchService[];
    flatrate?: WatchService[];
    ads?: WatchService[];
    free?: WatchService[];
  }>;
}

export interface MovieIndex {
  title: string;
  tmdbRating: number;
  genres?: number[];
  keywords?: number[];
  release: string;
}

export interface MoviePollItemData {
  readonly id: number;
  readonly title: string;
  readonly originalTitle: string;
  readonly tagline: string;
  readonly overview: string;
  readonly director: string; // new
  readonly productionCountry: string; // new
  readonly runtime: number;
  readonly releaseDate: string;
  readonly posterPath: string; // new
  readonly backdropPath: string;
  readonly tmdbRating: number;
}

export interface WatchlistItem {
  moviePollItemData: MoviePollItemData;
  movieIndex: MovieIndex;
}

export interface BaseMovieCredit {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;                  
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
  credit_id: string;
  media_type: 'movie' | 'tv';
}

export interface CastMovieCredit extends BaseMovieCredit {        
  character: string;
  order: number;
}

export interface CrewMovieCredit extends BaseMovieCredit {
  department: string;
  job: string;
}

export type MovieCredit =
  | CastMovieCredit
  | CrewMovieCredit;

// TMDB's /person/{id}?append_to_response=combined_credits response.
export interface TMDbPerson {
  readonly id: number;
  readonly name: string;
  readonly biography: string;
  readonly birthday?: string;
  readonly deathday?: string;
  readonly place_of_birth?: string;
  readonly known_for_department: string;
  readonly profile_path: string | null;
  readonly imdb_id?: string;
  readonly movie_credits?: { cast: CastMovieCredit[]; crew: CrewMovieCredit[] };
  readonly combined_credits?: { cast: CastMovieCredit[]; crew: CrewMovieCredit[] };
}
