import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";
import { SEEN } from "./movie-poll-item/movie-helpers";

type SortOrder = 'desc' | 'asc';

@Pipe({ name: "sort" })
export class SortPipe implements PipeTransform {
  constructor() {}

  transform(
    pollItems: PollItem[],
    sortType: "smart" | "regular" | "score" | "title" | "release" | "ranked" = "smart",
    sortOrder: SortOrder = 'desc'
  ): any {
    return pollItems?.sort((a, b) => {
      return sortType === "smart"
      ? smartSortPollItems(a, b, sortOrder)
      : sortType === "title"
      ? sortAlphabetical(a, b, sortOrder)
      : sortType === "score"
      ? sortScore(a, b, sortOrder)
      : sortType === "release"
      ? sortRelease(a, b, sortOrder)
      : sortType === "ranked"
      ? sortRank(a, b, sortOrder)
      : sortPollItems(a, b, sortOrder)
    });
  }
}

function seenReactionCount(item: PollItem): number {
  return item.reactions?.find((r) => r.label === SEEN)?.users.length || 0;
}

export function sortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.visible === false || (!a.selected && b.selected)) {
    if (b.visible === false) {
      return sortVoters(a, b);
    }
    return order === 'desc' ? 1 : -1;
  }

  if (b.visible === false || (a.selected && !b.selected)) {
    return order === 'desc' ? -1 : 1;
  }

  return sortVoters(a, b);
}

export function sortVoters(a: PollItem, b: PollItem): number {
  if (a.voters.length > b.voters.length) {
    return -1;
  }
  if (a.voters.length < b.voters.length) {
    return 1;
  }
  return sortDefault(a, b);
}

export function sortScore(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.movieIndex?.tmdbRating > b.movieIndex?.tmdbRating) {
    return order === 'desc' ? -1 : 1;
  }
  if (a.movieIndex?.tmdbRating < b.movieIndex?.tmdbRating) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function sortAlphabetical(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.movieIndex?.title < b.movieIndex?.title) {
    return order === 'desc' ? -1 : 1;
  }
  if (a.movieIndex?.title > b.movieIndex?.title) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

export function smartSortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (seenReactionCount(a) || a.visible === false || (!a.selected && b.selected)) {
    if (seenReactionCount(b) || b.visible === false) {
      return sortPollItems(a, b);
    }
    return order === 'desc' ? 1 : -1;
  }

  if (seenReactionCount(b) || b.visible === false || (a.selected && !b.selected)) {
    return order === 'desc' ? -1 : 1;
  }

  return a.voters.length < b.voters.length
    ? order === 'desc' ? 1 : -1
    : a.voters.length > b.voters.length
    ? order === 'desc' ? -1 : 1
    : sortDefault(a, b);
}

export function sortRelease(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.moviePollItemData?.releaseDate > b.moviePollItemData?.releaseDate) {
    return order === 'desc' ? -1 : 1;
  }
  if (a.moviePollItemData?.releaseDate < b.moviePollItemData?.releaseDate) {
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
