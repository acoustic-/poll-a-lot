// @ts-ignore
import { Movie } from "src/model/tmdb";

export function openImdb(imdbId: string): void {
  window.open("https://m.imdb.com/title/" + imdbId, "_blank");
}

export function openTmdb(tmdbId: any): void {
  window.open("https://www.themoviedb.org/movie/" + tmdbId, "_blank");
}
