import { Pipe, PipeTransform } from "@angular/core";
import { Movie } from "../model/tmdb";

@Pipe({ name: "productionCountry", standalone: true })
export class ProductionCoutryPipe implements PipeTransform {
  transform(movie: Movie, count: number = 100) {
    return (
      movie?.omdbMovie?.Country
        ? movie?.omdbMovie?.Country.split(", ")
        : movie.originalObject.production_countries.map(
            (country) => country.name
          )
    )
      .slice(0, count)
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
}
