import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";

@Pipe({ name: "sort" })
export class SortPipe implements PipeTransform {
  constructor() {}

  transform(pollItems: PollItem[], smartSort: boolean = false): any {
    return pollItems.sort(smartSort ? smartSortPollItems : sortPollItems);
  }
}

export function sortPollItems(a: PollItem, b: PollItem): number {
  if (a.voters.length > b.voters.length) {
    return -1;
  }
  if (a.voters.length < b.voters.length) {
    return 1;
  }
  return 0;
}

export function smartSortPollItems(a: PollItem, b: PollItem): number {
  if (
    ((b.reactions?.find((r) => r.label === "fa-eye")?.users.length || 0) > 0 &&
      (a.reactions?.find((r) => r.label === "fa-eye")?.users.length || 0) ==
        0) ||
    a.voters.length > b.voters.length
  ) {
    return -1;
  }
  if (
    ((a.reactions?.find((r) => r.label === "fa-eye")?.users.length || 0) > 0 &&
      (b.reactions?.find((r) => r.label === "fa-eye")?.users.length || 0) ==
        0) ||
    a.voters.length < b.voters.length
  ) {
    return 1;
  }
  return 0;
}
