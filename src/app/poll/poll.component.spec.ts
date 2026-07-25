import { PollItem } from '../../model/poll';
import { SEEN } from '../movie-poll-item/movie-helpers';
import {
  PollComponent,
  PollItemVoter,
  TotalDurationPipe,
  TotalPollItemsPipe,
  TotalVotesPipe,
  filteredVoteCount,
  voterKey,
} from './poll.component';

// buildVoterFilter is a private method: instantiated via Object.create rather than
// `new PollComponent(...)` so the constructor's DI-heavy subscriptions (Firestore,
// Router, Analytics, ...) never run — the method itself only reads its two
// parameters, so a constructor-less instance is all it needs to be called safely.
function callBuildVoterFilter(pollItems: PollItem[], previous: PollItemVoter | undefined): PollItemVoter {
  const instance = Object.create(PollComponent.prototype) as PollComponent;
  return (instance as any).buildVoterFilter(pollItems, previous);
}

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

  describe('buildVoterFilter (H3 regression: voter filter must survive a pollItems$ update)', () => {
    it('selects every voter by default on the first computation (no previous filter)', () => {
      const items = [
        item({ id: 'a', voters: [{ name: 'Alice', timestamp: 1 }, { name: 'Bob', timestamp: 2 }] }),
      ];
      const result = callBuildVoterFilter(items, undefined);
      expect(result.selected).toBeTrue();
      expect(result.voters?.map(v => v.name).sort()).toEqual(['Alice', 'Bob']);
      expect(result.voters?.every(v => v.selected)).toBeTrue();
    });

    it('does NOT reset a narrowed filter back to "everyone selected" when pollItems changes', () => {
      const before = [
        item({ id: 'a', voters: [{ name: 'Alice', timestamp: 1 }, { name: 'Bob', timestamp: 2 }] }),
      ];
      const initialFilter = callBuildVoterFilter(before, undefined);
      // Viewer narrows the filter down to only Alice.
      const narrowed: PollItemVoter = {
        ...initialFilter,
        selected: false,
        voters: initialFilter.voters!.map(v => ({ ...v, selected: v.name === 'Alice' })),
      };

      // Someone casts another vote -> pollItems$ re-emits.
      const after = [
        item({
          id: 'a',
          voters: [{ name: 'Alice', timestamp: 1 }, { name: 'Bob', timestamp: 2 }, { name: 'Carol', timestamp: 3 }],
        }),
      ];
      const result = callBuildVoterFilter(after, narrowed);

      const byName = new Map(result.voters!.map(v => [v.name, v.selected]));
      expect(byName.get('Alice')).toBeTrue();
      expect(byName.get('Bob')).toBeFalse();
    });

    it('defaults a brand-new voter to selected while preserving everyone else\'s existing state', () => {
      const before = [item({ id: 'a', voters: [{ name: 'Alice', timestamp: 1 }] })];
      const initialFilter = callBuildVoterFilter(before, undefined);
      const narrowed: PollItemVoter = {
        ...initialFilter,
        selected: false,
        voters: initialFilter.voters!.map(v => ({ ...v, selected: false })),
      };

      const after = [
        item({ id: 'a', voters: [{ name: 'Alice', timestamp: 1 }, { name: 'NewVoter', timestamp: 2 }] }),
      ];
      const result = callBuildVoterFilter(after, narrowed);

      const byName = new Map(result.voters!.map(v => [v.name, v.selected]));
      expect(byName.get('Alice')).toBeFalse();
      expect(byName.get('NewVoter')).toBeTrue();
    });

    it('sets the top-level "All Voters" selected flag to true only once every voter is selected', () => {
      const items = [
        item({ id: 'a', voters: [{ name: 'Alice', timestamp: 1 }, { name: 'Bob', timestamp: 2 }] }),
      ];
      const allSelected = callBuildVoterFilter(items, undefined);
      expect(allSelected.selected).toBeTrue();

      const partial: PollItemVoter = {
        ...allSelected,
        voters: allSelected.voters!.map(v => (v.name === 'Bob' ? { ...v, selected: false } : v)),
      };
      const result = callBuildVoterFilter(items, partial);
      expect(result.selected).toBeFalse();
    });
  });
});
