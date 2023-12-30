import { Pipe, PipeTransform } from "@angular/core";
import { User } from "../model/user";

@Pipe({ name: "voters", standalone: true })
export class VotersPipe implements PipeTransform {
  transform(voters: User[], prefix?: string) {
    if (voters.length === 0) {
      return "Be the first voter! ✨";
    }
    return `${prefix || ""}${
      voters
        ?.map(
          (voter) =>
            `${voter.name}${voter.useSuffix ? "_" + voter.useSuffix : ""}`
        )
        .join(", ") || ""
    }`;
  }
}
