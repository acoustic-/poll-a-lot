// @ts-ignore
import { LetterboxdItem } from "../../model/letterboxd";
import { PollItem } from "../../model/poll";
import { Movie, TMDbMovie } from "../../model/tmdb";

export const SEEN = "visibility";

export function openImdb(imdbId: string, type = 'title'): void {
  window.open(`https://m.imdb.com/${type}/${imdbId}`, "_blank");
}

export function openTmdb(tmdbId: any, type = 'movie'): void {
  window.open(`https://www.themoviedb.org/${type}/${tmdbId}`, "_blank");
}

export function openLetterboxd(letterboxdItem?: LetterboxdItem): void {
  const link = letterboxdItem?.links.find((x) => x.type === "letterboxd").url;
  if (link) {
    window.open(link, "_blank");
  }
}

export function getSimpleMovieTitle(movie: Movie | TMDbMovie): string {
  const _movie = movie as any;
  const year = new Date(
    _movie.releaseDate || _movie.release_date
  ).getFullYear();
  const title = movie.title ? movie.title : "";
  return `${movie.title} (${year})`;
}

export function getPollMovies(pollItems: PollItem[]): number[] {
  return (pollItems || [])
    .map((pollItem) => pollItem.movieId)
    .filter((x) => !!x);
}
