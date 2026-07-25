import { PollItem } from '../../model/poll';
import { SEEN } from '../movie-poll-item/movie-helpers';
import {
  PollItemVoter,
  TotalDurationPipe,
  TotalPollItemsPipe,
  TotalVotesPipe,
  filteredVoteCount,
  voterKey,
} from './poll.component';

function item(overrides: Partial<PollItem> = {}): PollItem {
  return {
    id: overrides.id ?? 'item-1',
    pollId: 'poll-1',
    name: 'Item',
    created: '100',
    voters: [],
    order: 0,
    ...overrides,
  } as PollItem;
}

describe('poll.component pure helpers', () => {
  describe('voterKey', () => {
    it('prefers id, then localUserId, then name', () => {
      expect(voterKey({ id: 'id1', localUserId: 'local1', name: 'Alice' })).toBe('id1');
      expect(voterKey({ localUserId: 'local1', name: 'Alice' })).toBe('local1');
      expect(voterKey({ name: 'Alice' })).toBe('Alice');
    });

    it('returns an empty string when nothing identifies the voter', () => {
      expect(voterKey({})).toBe('');
    });

    it('does not let two voters that both lack id/localUserId/name collide with an identified voter', () => {
      // Both anonymous voters key to "" if truly empty, but any populated field wins over undefined.
      const a = voterKey({ id: undefined, localUserId: undefined, name: undefined });
      const b = voterKey({ id: 'real-id' });
      expect(a).not.toBe(b);
    });
  });

  describe('filteredVoteCount', () => {
    it('counts every voter when no filter is applied', () => {
      const pollItem = item({ voters: [{ name: 'A', timestamp: 1 }, { name: 'B', timestamp: 2 }] });
      expect(filteredVoteCount(pollItem)).toBe(2);
    });

    it('returns 0 for a poll item with no voters array', () => {
      expect(filteredVoteCount({ ...item(), voters: undefined as any })).toBe(0);
    });

    it('counts only voters present in the selected-voter filter', () => {
      const pollItem = item({ voters: [{ name: 'A', timestamp: 1 }, { name: 'B', timestamp: 2 }] });
      const selectedVoters: PollItemVoter[] = [
        { name: 'A', selected: true },
        { name: 'B', selected: false },
      ];
      expect(filteredVoteCount(pollItem, selectedVoters)).toBe(1);
    });

    it('treats an empty/undefined selectedVoters filter as "everyone"', () => {
      const pollItem = item({ voters: [{ name: 'A', timestamp: 1 }] });
      expect(filteredVoteCount(pollItem, [])).toBe(1);
    });

    it('sums points instead of counting heads when pointVoting is true', () => {
      const pollItem = item({
        voters: [
          { name: 'A', timestamp: 1, points: 3 },
          { name: 'B', timestamp: 2, points: 2 },
        ],
      });
      expect(filteredVoteCount(pollItem, undefined, true)).toBe(5);
    });

    it('treats a legacy voter with no `points` field as worth 1 point', () => {
      const pollItem = item({ voters: [{ name: 'A', timestamp: 1 }] });
      expect(filteredVoteCount(pollItem, undefined, true)).toBe(1);
    });

    it('combines the voter filter and point-voting sum together', () => {
      const pollItem = item({
        voters: [
          { name: 'A', timestamp: 1, points: 3 },
          { name: 'B', timestamp: 2, points: 4 },
        ],
      });
      const selectedVoters: PollItemVoter[] = [{ name: 'A', selected: true }];
      expect(filteredVoteCount(pollItem, selectedVoters, true)).toBe(3);
    });
  });

  describe('TotalVotesPipe', () => {
    it('sums filteredVoteCount across every poll item', () => {
      const pipe = new TotalVotesPipe();
      const items = [
        item({ id: 'a', voters: [{ name: 'A', timestamp: 1 }] }),
        item({ id: 'b', voters: [{ name: 'A', timestamp: 1 }, { name: 'B', timestamp: 2 }] }),
      ];
      expect(pipe.transform(items)).toBe(3);
    });

    it('returns 0 for a nullish list', () => {
      expect(new TotalVotesPipe().transform(undefined as any)).toBe(0);
    });
  });

  describe('TotalPollItemsPipe', () => {
    it('counts visible items and excludes hidden ones', () => {
      const pipe = new TotalPollItemsPipe();
      const items = [item({ id: 'a' }), item({ id: 'b', visible: false }), item({ id: 'c' })];
      expect(pipe.transform(items, false)).toBe(2);
    });

    it('excludes items marked SEEN when useSeenReactions is true', () => {
      const pipe = new TotalPollItemsPipe();
      const items = [
        item({ id: 'a' }),
        item({ id: 'b', reactions: [{ label: SEEN, users: [{ name: 'A' }] }] }),
      ];
      expect(pipe.transform(items, true)).toBe(1);
    });

    it('does not exclude SEEN items when useSeenReactions is false', () => {
      const pipe = new TotalPollItemsPipe();
      const items = [
        item({ id: 'a' }),
        item({ id: 'b', reactions: [{ label: SEEN, users: [{ name: 'A' }] }] }),
      ];
      expect(pipe.transform(items, false)).toBe(2);
    });
  });

  describe('TotalDurationPipe', () => {
    it('sums the runtime of all visible items when nothing is selected', () => {
      const pipe = new TotalDurationPipe();
      const items = [
        item({ id: 'a', moviePollItemData: { runtime: 90 } as any }),
        item({ id: 'b', moviePollItemData: { runtime: 120 } as any }),
      ];
      expect(pipe.transform(items, false)).toContain('Duration: 210 minutes');
    });

    it('sums only the selected items\' runtime once any item is selected', () => {
      const pipe = new TotalDurationPipe();
      const items = [
        item({ id: 'a', selected: true, moviePollItemData: { runtime: 90 } as any }),
        item({ id: 'b', moviePollItemData: { runtime: 120 } as any }),
      ];
      expect(pipe.transform(items, false)).toContain('Selected: 90 minutes');
    });

    it('reports "0 minutes" for an empty/nullish list', () => {
      const pipe = new TotalDurationPipe();
      expect(pipe.transform(undefined as any, false)).toBe('0 minutes');
    });
  });
});
