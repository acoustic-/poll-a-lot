import { Pipe, PipeTransform } from "@angular/core";
import { hyphenateSync as hyphenate } from "hyphen/en";

@Pipe({ name: "hyphen", standalone: true })
export class HyphenatePipe implements PipeTransform {
  transform(text: string) {
    const result = hyphenate(text);
    return result;
  }
}
