// @ts-ignore
import { Movie } from "src/model/tmdb";

export function getMetaBgColor(rating: string) {
  const ratingNumber = parseInt(rating);
  if (ratingNumber >= 61) {
    return "green";
  } else if (ratingNumber >= 40 && ratingNumber <= 60) {
    return "yellow";
  } else {
    return "red";
  }
}

export function openImdb(imdbId: string): void {
  window.open("https://m.imdb.com/title/" + imdbId, "_blank");
}

export function openTmdb(tmdbId: any): void {
  window.open("https://www.themoviedb.org/movie/" + tmdbId, "_blank");
}

export function getProductionCountries(movie: Movie): string {
  return movie.originalObject.production_countries
    .slice(0, 1)
    .map((country) => country.name)
    .map((country) => {
      switch (country.toLowerCase()) {
        case "united states of america":
          return "united states";
        default:
          return country;
      }
    })
    .join(", ");
}

export function getDirector(movie: Movie): string {
  if (!movie) {
    return "";
  }
  return movie.credits.crew
    .filter((c) => c.department === "Directing" && c.job === "Director")
    .map((c) => c.name)
    .join(", ");
}

export function getWriter(movie: Movie): { job: string; name: string }[] {
  return movie.credits.crew
    .filter(
      (c) =>
        c.department === "Writing" &&
        (c.job === "Screenplay" || c.job === "Novel")
    )
    .map((c) => ({ job: c.job, name: c.name }));
}

export function getActors(movie: Movie, count: number = 3): string {
  const compareOrder = (a: { order: number }, b: { order: number }) => {
    if (a.order < b.order) {
      return -1;
    } else if (a.order > b.order) {
      return 1;
    }
    return 0;
  };

  return movie.credits.cast
    .sort(compareOrder)
    .slice(0, count)
    .map((c) => c.name)
    .join(", ");
}
