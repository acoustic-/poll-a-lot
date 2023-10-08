import { Pipe, PipeTransform } from "@angular/core";

import * as emojiFlags from "emoji-flags";

@Pipe({ name: "countryFlagName", standalone: true })
export class CountryFlagNamePipe implements PipeTransform {
  transform(countryCode: string) {
    const country = emojiFlags.countryCode(countryCode);
    return `${country.emoji} ${country.name}`;
  }
}
