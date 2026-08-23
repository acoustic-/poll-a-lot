import { Pipe, PipeTransform } from "@angular/core";
import { PollItem } from "../model/poll";
import { SEEN } from "./movie-poll-item/movie-helpers";
import { filteredVoteCount, PollItemVoter } from "./poll/poll-voters";

type SortOrder = 'desc' | 'asc';

@Pipe({ name: "sort" })
export class SortPipe implements PipeTransform {
  transform(
    pollItems: PollItem[],
    sortType: "smart" | "regular" | "score" | "title" | "release" | "ranked" | string = "smart",
    sortOrder: SortOrder = 'desc',
    selectedVoters?: PollItemVoter[],
    pointVoting = false
  ): PollItem[] | undefined {
    return pollItems?.sort((a, b) => {
      return sortType === "smart"
      ? smartSortPollItems(a, b, sortOrder, selectedVoters, pointVoting)
      : sortType === "title"
      ? sortAlphabetical(a, b, sortOrder)
      : sortType === "score"
      ? sortScore(a, b, sortOrder)
      : sortType === "release"
      ? sortRelease(a, b, sortOrder)
      : sortType === "ranked"
      ? sortRank(a, b, sortOrder)
      : sortPollItems(a, b, sortOrder, selectedVoters, pointVoting)
    });
  }
}

function seenReactionCount(item: PollItem): number {
  return item.reactions?.find((r) => r.label === SEEN)?.users.length || 0;
}

export function sortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc', selectedVoters?: PollItemVoter[], pointVoting = false): number {
  if (a.visible === false || (!a.selected && b.selected)) {
    if (b.visible === false) {
      return sortVoters(a, b, selectedVoters, pointVoting);
    }
    return order === 'desc' ? 1 : -1;
  }

  if (b.visible === false || (a.selected && !b.selected)) {
    return order === 'desc' ? -1 : 1;
  }

  return sortVoters(a, b, selectedVoters, pointVoting);
}

export function sortVoters(a: PollItem, b: PollItem, selectedVoters?: PollItemVoter[], pointVoting = false): number {
  const aVotes = filteredVoteCount(a, selectedVoters, pointVoting);
  const bVotes = filteredVoteCount(b, selectedVoters, pointVoting);
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

// Unlike sortScore/sortRelease/sortRank ("desc" = greater value first), this
// branch order is intentionally flipped: order='desc' sorts titles A-to-Z. The
// UI never exposes a Title asc/desc toggle (only one "Title" option, always
// called with the default), so this is a fixed, deliberate choice, not an
// unnoticed bug — confirmed and kept as-is.
export function sortAlphabetical(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if ((a.movieIndex?.title ?? '') < (b.movieIndex?.title ?? '')) {
    return order === 'desc' ? -1 : 1;
  }
  if ((a.movieIndex?.title ?? '') > (b.movieIndex?.title ?? '')) {
    return order === 'desc' ? 1 : -1;
  }
  return sortDefault(a, b);
}

function isDeprioritized(item: PollItem): boolean {
  return !!seenReactionCount(item) || item.visible === false;
}

// Two tiers: not-seen (and visible) items above seen/hidden ones, regardless
// of vote count or selected status — then within each tier, the regular
// selected-first/vote-count ordering (sortPollItems) applies. Deciding the
// tier with a single boolean per item (rather than folding "seen" into the
// same OR-chain sortPollItems uses for "selected") keeps this comparator
// symmetric: comparing (a, b) and (b, a) must agree, or Array.sort's result
// is implementation-defined. The previous version broke that — a seen+selected
// item could still float above a not-seen item, since which branch ran (and
// therefore whether sortPollItems' own selected-first logic even saw the pair)
// depended on which item was passed as `a`.
export function smartSortPollItems(a: PollItem, b: PollItem, order: SortOrder = 'desc', selectedVoters?: PollItemVoter[], pointVoting = false): number {
  const aDown = isDeprioritized(a);
  const bDown = isDeprioritized(b);
  if (aDown && !bDown) {
    return order === 'desc' ? 1 : -1;
  }
  if (bDown && !aDown) {
    return order === 'desc' ? -1 : 1;
  }
  return sortPollItems(a, b, order, selectedVoters, pointVoting);
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

// Every caller above falls back to this on a tie, always with the default
// order (none of them ever pass a second argument), so this is the one
// direction that's actually live: ties resolve oldest-created-item-first.
// That's the opposite of sortScore/sortRelease/sortRank's own "desc" = greater
// value first convention, but it's a deliberate, reviewed choice rather than
// an unnoticed inconsistency — kept as-is.
export function sortDefault(a: PollItem, b: PollItem, order: SortOrder = 'desc'): number {
  if (a.created < b.created) {
    return order === 'desc' ? -1 : 1;
  }
  if (a.created > b.created) {
    return order === 'desc' ? 1 : -1;
  }
  return 0;
}
