// @ts-ignore
import { LetterboxdItem } from "src/model/tmdb";

export const SEEN = 'visibility';

export function openImdb(imdbId: string): void {
  window.open("https://m.imdb.com/title/" + imdbId, "_blank");
}

export function openTmdb(tmdbId: any): void {
  window.open("https://www.themoviedb.org/movie/" + tmdbId, "_blank");
}

export function openLetterboxd(letterboxdItem?: LetterboxdItem): void {
  const link = letterboxdItem?.links.find(x => x.type === 'letterboxd').url;
  if (link) {
    window.open(link, "_blank");
  }
}
