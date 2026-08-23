import { LetterboxdItem } from "../../model/letterboxd";
import { PollItem } from "../../model/poll";
import { Movie, TMDbMovie } from "../../model/tmdb";

export const SEEN = "visibility";

export function openImdb(imdbId: string, type = 'title'): void {
  window.open(`https://m.imdb.com/${type}/${imdbId}`, "_blank");
}

export function openTmdb(tmdbId: string | number, type = 'movie'): void {
  window.open(`https://www.themoviedb.org/${type}/${tmdbId}`, "_blank");
}

export function openLetterboxd(letterboxdItem?: LetterboxdItem): void {
  const link = letterboxdItem?.links.find((x) => x.type === "letterboxd")?.url;
  if (link) {
    window.open(link, "_blank");
  }
}

export function getSimpleMovieTitle(movie: Movie | TMDbMovie): string {
  const year = new Date(
    (movie as Movie).releaseDate || (movie as TMDbMovie).release_date
  ).getFullYear();
  return `${movie.title} (${year})`;
}

export function getPollMovies(pollItems: PollItem[]): number[] {
  return (pollItems || [])
    .map((pollItem) => pollItem.movieId)
    .filter((x) => !!x);
}
