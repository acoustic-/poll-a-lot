import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";

@Pipe({ name: "voters", standalone: true })
export class VotersPipe implements PipeTransform {
  transform(pollItem: PollItem, prefix?: string) {
    return `${
      prefix ? `${prefix} :` : ""
    }pollItem?.voters?.map((voter) => voter.name).join(", ") || ""`;
  }
}
