import { Pipe, PipeTransform } from "@angular/core";
import { Movie } from "../model/tmdb";

@Pipe({ name: "credit", standalone: true })
export class MovieCreditPipe implements PipeTransform {
  transform(
    movie: Movie,
    type: "directors" | "writers" | "actors",
    returns: "string" | "with-job" | "object" = "string",
    count: number | undefined = undefined
  ) {
    if (!movie) {
      return;
    }

    const compareOrder = (a: { order: number }, b: { order: number }) => {
      if (a.order < b.order) {
        return -1;
      } else if (a.order > b.order) {
        return 1;
      }
      return 0;
    };

    let people;
    switch (type) {
      case "directors":
        people = movie.credits.crew.filter(
          (c) => c.department === "Directing" && c.job === "Director"
        );
        break;
      case "writers":
        people = movie.credits.crew.filter(
          (c) =>
            c.department === "Writing" &&
            (c.job === "Writer" || c.job === "Screenplay" || c.job === "Novel")
        );
        break;
      default:
        people = movie.credits.cast.sort(compareOrder).slice(0, count);
    }

    let value;

    switch (returns) {
      case "string":
        value = people
          .slice(0, count || 100)
          .map((c) => c.name)
          .join(", ");
        break;

      case "with-job":
        value = people
          .slice(0, count || 100)
          .map((c) => ({ job: c.job, name: c.name }));
        break;

      default:
        value = movie.credits.cast
          .sort(compareOrder)
          .slice(0, count || 100)
          .map((c) => c.name)
          .join(", ");
    }
    return value;
  }
}
