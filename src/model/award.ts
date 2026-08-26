export interface OscarAward {
    category: string;
    year: string;
    nominees: string[];
    movies: {
        title: string;
        tmdb_id: number;
    }[];
    won: boolean;
}