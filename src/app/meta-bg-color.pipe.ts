import { Pipe, PipeTransform } from "@angular/core";

@Pipe({ name: "metaColor", standalone: true })
export class MetaColorPipe implements PipeTransform {
  transform(rating: string) {
    const ratingNumber = parseInt(rating);
    if (ratingNumber >= 61) {
      return "green";
    } else if (ratingNumber >= 40 && ratingNumber <= 60) {
      return "yellow";
    } else {
      return "red";
    }
  }
}
