import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";
import { SEEN } from "./movie-poll-item/movie-helpers";
import { filteredVoteCount, PollItemVoter } from "./poll/poll.component";

type SortOrder = 'desc' | 'asc';

@Pipe({
    name: "sort",
    standalone: false
})
export class SortPipe implements PipeTransform {
  constructor() {}

  transform(
    pollItems: PollItem[],
    sortType: "smart" | "regular" | "score" | "title" | "release" | "ranked" | string = "smart",
    sortOrder: SortOrder = 'desc',
    selectedVoters?: PollItemVoter[]
  ): any {
    return pollItems?.sort((a, b) => {
      return sortType === "smart"
      ? smartSortPollItems(a, b, sortOrder, selectedVoters)
      : sortType === "title"
      ? sortAlphabetical(a, b, sortOrder)
      : sortType === "score"
      ? sortScore(a, b, sortOrder)
      : sortType === "release"
      ? sortRelease(a, b, sortOrder)
      : sortType === "ranked"
      ? sortRank(a, b, sortOrder)
      : sortPollItems(a, b, sortOrder, selectedVoters)
    });
  }
}

function seenReactionCount(item: PollItem): number {
  return item.reactions?.find((r) => r.label === SEEN)?.users.length || 0;
}

export function sortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc', selectedVoters?: PollItemVoter[]): number {
  if (a.visible === false || (!a.selected && b.selected)) {
    if (b.visible === false) {
      return sortVoters(a, b, selectedVoters);
    }
    return order === 'desc' ? 1 : -1;
  }

  if (b.visible === false || (a.selected && !b.selected)) {
    return order === 'desc' ? -1 : 1;
  }

  return sortVoters(a, b, selectedVoters);
}

export function sortVoters(a: PollItem, b: PollItem, selectedVoters?: PollItemVoter[]): number {
  const aVotes = filteredVoteCount(a, selectedVoters);
  const bVotes = filteredVoteCount(b, selectedVoters);
  if (aVotes > bVotes) {
    return -1;
  }
  if (aVotes < bVotes) {
    return 1;
  }
  return sortDefault(a, b);
}

export function sortScore(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  const aRating = a.movieIndex?.tmdbRating ?? 0;
  const bRating = b.movieIndex?.tmdbRating ?? 0;
  if (aRating > bRating) {
    return order === 'desc' ? -1 : 1;
  }
  if (aRating < bRating) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function sortAlphabetical(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if ((a.movieIndex?.title ?? '') < (b.movieIndex?.title ?? '')) {
    return order === 'desc' ? -1 : 1;
  }
  if ((a.movieIndex?.title ?? '') > (b.movieIndex?.title ?? '')) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function smartSortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc', selectedVoters?: PollItemVoter[]): number {
  if (seenReactionCount(a) || a.visible === false || (!a.selected && b.selected)) {
    if (seenReactionCount(b) || b.visible === false) {
      return sortPollItems(a, b, undefined, selectedVoters);
    }
    return order === 'desc' ? 1 : -1;
  }

  if (seenReactionCount(b) || b.visible === false || (a.selected && !b.selected)) {
    return order === 'desc' ? -1 : 1;
  }

  const aVotes = filteredVoteCount(a, selectedVoters);
  const bVotes = filteredVoteCount(b, selectedVoters);
  return aVotes < bVotes
    ? order === 'desc' ? 1 : -1
    : aVotes > bVotes
    ? order === 'desc' ? -1 : 1
    : sortDefault(a, b);
}

export function sortRelease(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  const aDate = a.moviePollItemData?.releaseDate ?? '';
  const bDate = b.moviePollItemData?.releaseDate ?? '';
  if (aDate > bDate) {
    return order === 'desc' ? -1 : 1;
  }
  if (aDate < bDate) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function sortRank(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a?.order < b?.order) {
    return order === 'desc' ? -1 : 1;
  }
  if (a?.order > b?.order) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function sortDefault(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.created < b.created) {
    return order === 'desc' ? -1 : 1;
  }
  if (a.created > b.created) {
    return order === 'desc' ? 1 : -1;
  }
  return 0;
}
