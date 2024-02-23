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
  readonly images: any;
  readonly recommendations: Recommendation;
  readonly keywords?: { keywords: { id: number; name: string }[] };
}

interface MoviePrototype {
  readonly posterUrl: string | null;
  readonly posterPath: string | null;
  readonly overview: string;
  readonly releaseDate: string;
  readonly genres: string[];
  readonly id: number;
  readonly imdbId: string;
  readonly originalTitle: string;
  readonly title: string;
  readonly tagline: string;
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
  readonly omdbMovie?: any; // type this
  readonly originalObject: TMDbMovie;
  readonly recommendations: Recommendation;
  readonly productionCountries: { name: string }[];
}

export interface ExtraRating {
  readonly imdbRating: number;
  readonly metaRating: string;
  readonly rottenRating: string;
  readonly letterboxdRating: number;
}

export interface Movie extends MoviePrototype, Partial<ExtraRating> {
  letterboxdItem?: LetterboxdItem
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

export interface LetterboxdItem {
  id: string;
  name: string;
  sortingName: string;
  alternativeNames: string[];
  releaseYear: number;
  runTime: number;
  rating: number;
  poster: {
    sizes: { width: number; height: number; url: string }[];
  };
  adult: boolean;
  reviewsHidden: boolean;
  posterCustomisable: boolean;
  links: { type: string; id: string; url: string }[];
  genres: { id: string; name: string };
  tagline: string;
  description: string;
  top250Position: number | null;
  filmCollectionId: string;
  backdrop: { sizes: { width: number; height: number; url: string }[] };
  backdropFocalPoint: number;
  trailer: { type: string; id: string; url: string };
  countries: { code: string; name: string; flagUrl: string }[];
  originalLanguage: { code: string; name: string };
  productionLanguage: { code: string; name: string };
  primaryLanguage: { code: string; name: string };
  languages: { code: string; name: string }[];
  releases: {
    type: string;
    country: {
      code: string;
      name: string;
      flagUrl: string;
      certification: string;
      note: string;
      releaseDate: string;
    };
  }[];
  contributions: {
    type: string;
    contributors: {
      id: string;
      name: string;
      characterName?: string;
      tmdbid: number;
    }[];
  }[];
  news: {
    title: string;
    image: { sizes: { width: number; height: number; url: string }[] };
    url: string;
    shortDescription: string;
    longDescription: string;
  }[];
  recentStories: {
    id: string;
    name: string;
    author: {
      id: string;
      username: string;
      givenname: string;
      displayName: string;
      shortName: string;
      pronoun: {
        id: string;
        label: string;
        subjectPronoun: string;
        objectPronoun: string;
        possessiveAdjective: string;
        reflexive: string;
      };
      avatar: { sizes: { width: number; height: number; url: string }[] };
      memberStatus: string;
      hideAdsInContent: boolean;
      accountStatus: string;
      hideAds;
    }[];
    videoUrl: string;
    bodyHtml: string;
    bodyLbml: string;
    whenUpdated: string;
    whenCreated: string;
    pinned: boolean;
    image: { sizes: { width: number; height: number; url: string }[] }
  }[];
}
