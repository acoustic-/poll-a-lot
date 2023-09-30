import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";

@Pipe({ name: "sort" })
export class SortPipe implements PipeTransform {
  constructor() {}

  transform(
    pollItems: PollItem[],
    sortType: "smart" | "regular" | "score" | "title" = "smart"
  ): any {
    return pollItems.sort(
      sortType === "smart"
        ? smartSortPollItems
        : sortType === "title"
        ? sortAlphabetical
        : sortType === "score"
        ? sortScore
        : sortPollItems
    );
  }
}

function seenReactionCount(item: PollItem): number {
  return item.reactions?.find((r) => r.label === "fa-eye")?.users.length || 0;
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

export function sortScore(a: PollItem, b: PollItem): number {
  if (a.movie?.tmdbRating > b.movie?.tmdbRating) {
    return -1;
  }
  if (a.movie?.tmdbRating < b.movie?.tmdbRating) {
    return 1;
  }
  return 0;
}

export function sortAlphabetical(a: PollItem, b: PollItem): number {
  if (a.movie?.title > b.movie?.title) {
    return -1;
  }
  if (a.movie?.title < b.movie?.title) {
    return 1;
  }
  return 0;
}

export function smartSortPollItems(a: PollItem, b: PollItem): number {
  if (seenReactionCount(a)) {
    if (seenReactionCount(b)) {
      return b.voters.length - a.voters.length;
    }
    return 1;
  }

  if (seenReactionCount(b)) {
    return -1;
  }
  return a.voters.length < b.voters.length ? 1 : -1;
}
