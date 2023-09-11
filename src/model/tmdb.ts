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
  readonly backdrop_path?: string;
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
  readonly images: any;
  readonly recommendations: Recommendation;
}

export interface Movie {
  readonly posterUrl?: string;
  readonly overview: string;
  readonly releaseDate: string;
  readonly genres: string[];
  readonly id: number;
  readonly imdbId: string;
  readonly originalTitle: string;
  readonly title: string;
  readonly tagline: string;
  readonly backdropUrl?: string;
  readonly popularity: number;
  readonly voteCount: number;
  readonly tmdbRating: number;
  readonly imdbRating?: number;
  readonly metaRating?: string;
  readonly rottenRating?: string;
  readonly runtime?: number;
  readonly credits: {
    cast: Cast[];
    crew: Crew[];
  };
  readonly originalObject: TMDbMovie;
  readonly recommendations: Recommendation;
  readonly productionCountries: { name: string }[];
}

export interface ExtraRating {
  readonly imdbRating?: number;
  readonly metaRating?: string;
  readonly rottenRating?: string;
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
  results: {
    FI: {
      link: string;
      rent?: WatchService[];
      buy?: WatchService[];
      flatrate?: WatchService[];
      ads?: WatchService[];
      free?: WatchService[];
    };
  }[];
}
