export interface OscarAward {
    category: string;
    year: string;
    nominees: string[];
    movies: Array<{
        title: string;
        tmdb_id: number;
    }>;
    won: boolean;
}