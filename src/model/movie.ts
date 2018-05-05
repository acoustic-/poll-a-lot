export interface TMDbMovieResponse {
    readonly page: number,
    readonly results: TMDbMovie[],
    readonly total_results: number;
    readonly total_pages: number;
}

export interface TMDbMovie {
    readonly poster_path?: string;
    readonly adult: boolean;
    readonly overview: string;
    readonly release_date: string;
    readonly genres: { id: number, name: string }[];
    readonly id: number;
    readonly imdb_id?: string;
    readonly original_title: string;
    readonly title: string;
    readonly backdrop_path?: string;
    readonly popularity: number;
    readonly vote_count: number;
    readonly video: boolean;
    readonly vote_average: number;
    readonly runtime?: number;
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
    readonly backdropUrl?: string;
    readonly popularity: number;
    readonly voteCount: number;
    readonly tmdbRating: number;
    readonly imdbRating?: number;
    readonly metaRating?: string;
    readonly rottenRating?: string;
    readonly runtime?: number;
}

export interface ExtraRating {
    readonly imdbRating?: number;
    readonly metaRating?: string;
    readonly rottenRating?: string;
}

