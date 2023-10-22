import { Pipe, PipeTransform } from "@angular/core";
import { User } from "../model/user";

@Pipe({ name: "voters", standalone: true })
export class VotersPipe implements PipeTransform {
  transform(voters: User[], prefix?: string) {
    return `${prefix || ""}${
      voters?.map((voter) => voter.name).join(", ") || ""
    }`;
  }
}
