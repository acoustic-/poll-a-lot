import { Pipe, PipeTransform } from "@angular/core";
import { Movie } from "../model/tmdb";

@Pipe({ name: "productionCountry", standalone: true })
export class ProductionCoutryPipe implements PipeTransform {
  transform(movie: Movie) {
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
}
