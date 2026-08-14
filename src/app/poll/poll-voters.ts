import { PollItem } from "../../model/poll";
import { voterKey } from "../user-identity";

export interface PollItemVoter {
  id?: string;
  localUserId?: string;
  name: string;
  selected: boolean;
  voters?: PollItemVoter[];
}

// Vote count for a poll item, narrowed to the currently selected voter filter (or the
// raw count when no filter is applied). Shared by TotalVotesPipe and SortPipe so
// "votes"-based sorting reflects the same filtered numbers shown on screen.
// `pointVoting` defaults to false so every untouched call site stays byte-identical;
// when true, sums each matching voter's `points` (legacy binary votes with no
// `points` field count as 1) instead of counting matching voters.
export function filteredVoteCount(
  item: PollItem,
  selectedVoters?: PollItemVoter[],
  pointVoting = false
): number {
  if (!Array.isArray(item.voters)) return 0;
  const matching = !selectedVoters?.length
    ? item.voters
    : item.voters.filter(voter => {
        const key = voterKey(voter);
        return selectedVoters.some(selected => selected.selected && voterKey(selected) === key);
      });
  return pointVoting
    ? matching.reduce((sum, v) => sum + (v.points ?? 1), 0)
    : matching.length;
}
