import { PollItem } from '../model/poll';
import { PollItemVoter } from './poll/poll.component';
import { SEEN } from './movie-poll-item/movie-helpers';
import {
  SortPipe,
  sortAlphabetical,
  sortDefault,
  sortPollItems,
  sortRank,
  sortRelease,
  sortScore,
  sortVoters,
  smartSortPollItems,
} from './poll-item-sort.pipe';

function item(overrides: Partial<PollItem> = {}): PollItem {
  return {
    id: overrides.id ?? 'item-1',
    pollId: 'poll-1',
    name: overrides.id ?? 'Item',
    created: '100',
    voters: [],
    order: 0,
    ...overrides,
  } as PollItem;
}

function voter(name: string, points?: number) {
  return { name, timestamp: 1, ...(points !== undefined ? { points } : {}) };
}

function ids(items: PollItem[]): string[] {
  return items.map((i) => i.id);
}

describe('poll-item-sort.pipe', () => {
  describe('sortDefault', () => {
    // NB: unlike every other comparator in this file (sortScore/sortRelease/sortRank,
    // where order='desc' means "greater value first"), sortDefault's branches are
    // flipped: order='desc' actually orders by `created` ascending (oldest first).
    // These tests document that actual, currently-shipped behavior.
    it('orders older items first under the default "desc" order', () => {
      const older = item({ created: '100' });
      const newer = item({ created: '200' });
      expect(sortDefault(older, newer)).toBeLessThan(0);
      expect(sortDefault(newer, older)).toBeGreaterThan(0);
      expect(sortDefault(older, older)).toBe(0);
    });
  });

  describe('sortVoters', () => {
    it('ranks the item with more votes first regardless of order argument', () => {
      const a = item({ voters: [voter('A'), voter('B')] });
      const b = item({ voters: [voter('A')] });
      expect(sortVoters(a, b)).toBeLessThan(0);
      expect(sortVoters(b, a)).toBeGreaterThan(0);
    });

    it('falls back to sortDefault (oldest-first) on a vote tie', () => {
      const older = item({ id: 'a', created: '100', voters: [voter('A')] });
      const newer = item({ id: 'b', created: '200', voters: [voter('B')] });
      expect(sortVoters(older, newer)).toBeLessThan(0);
    });

    it('counts only votes from the selected voter filter', () => {
      const a = item({ voters: [voter('A'), voter('B')] });
      const b = item({ voters: [voter('A')] });
      const selectedVoters: PollItemVoter[] = [
        { name: 'A', selected: true },
        { name: 'B', selected: false },
      ];
      // Both items only have 1 matching (selected) vote from A, so it's a tie -> sortDefault.
      expect(sortVoters(a, b, selectedVoters)).toBe(sortDefault(a, b));
    });

    it('sums points instead of counting voters in point-voting mode', () => {
      const a = item({ voters: [voter('A', 3)] });
      const b = item({ voters: [voter('B'), voter('C')] });
      // a: 3 points vs b: 2 voters * legacy-1-point-each = 2 points -> a wins.
      expect(sortVoters(a, b, undefined, true)).toBeLessThan(0);
    });
  });

  describe('sortPollItems', () => {
    it('always sorts a hidden (visible === false) item after a visible one', () => {
      const hidden = item({ visible: false, voters: [voter('A'), voter('B'), voter('C')] });
      const visible = item({ voters: [] });
      expect(sortPollItems(hidden, visible)).toBeGreaterThan(0);
      expect(sortPollItems(visible, hidden)).toBeLessThan(0);
    });

    it('sorts a selected item ahead of an unselected one', () => {
      const selected = item({ selected: true });
      const unselected = item({ selected: false });
      expect(sortPollItems(unselected, selected)).toBeGreaterThan(0);
      expect(sortPollItems(selected, unselected)).toBeLessThan(0);
    });
  });

  describe('smartSortPollItems', () => {
    it('sorts an item reacted with SEEN after one that is not', () => {
      const seen = item({ reactions: [{ label: SEEN, users: [{ name: 'A' }] }] });
      const unseen = item({});
      expect(smartSortPollItems(seen, unseen)).toBeGreaterThan(0);
      expect(smartSortPollItems(unseen, seen)).toBeLessThan(0);
    });

    it('does not treat an empty-users SEEN reaction as seen', () => {
      const emptySeen = item({ reactions: [{ label: SEEN, users: [] }] });
      const other = item({});
      // Neither is "seen", so this falls through to a normal vote-count comparison (tie -> sortDefault).
      expect(smartSortPollItems(emptySeen, other)).toBe(sortDefault(emptySeen, other));
    });
  });

  describe('sortScore', () => {
    it('ranks higher TMDb rating first by default (desc)', () => {
      const high = item({ movieIndex: { tmdbRating: 8 } as any });
      const low = item({ movieIndex: { tmdbRating: 5 } as any });
      expect(sortScore(high, low)).toBeLessThan(0);
    });

    it('reverses order when order is asc', () => {
      const high = item({ movieIndex: { tmdbRating: 8 } as any });
      const low = item({ movieIndex: { tmdbRating: 5 } as any });
      expect(sortScore(high, low, 'asc')).toBeGreaterThan(0);
    });

    it('treats a missing rating as 0', () => {
      const withRating = item({ movieIndex: { tmdbRating: 1 } as any });
      const withoutRating = item({});
      expect(sortScore(withRating, withoutRating)).toBeLessThan(0);
    });
  });

  describe('sortAlphabetical', () => {
    // Same inverted-branch quirk as sortDefault: order='desc' here actually orders
    // titles A-to-Z, not Z-to-A. Documenting the real behavior, see note above.
    it('orders titles A-to-Z under the default "desc" order', () => {
      const a = item({ movieIndex: { title: 'Alpha' } as any });
      const z = item({ movieIndex: { title: 'Zeta' } as any });
      expect(sortAlphabetical(a, z)).toBeLessThan(0);
    });
  });

  describe('sortRelease', () => {
    it('orders the more recent release date first by default (desc)', () => {
      const older = item({ moviePollItemData: { releaseDate: '1990-01-01' } as any });
      const newer = item({ moviePollItemData: { releaseDate: '2020-01-01' } as any });
      expect(sortRelease(newer, older)).toBeLessThan(0);
    });
  });

  describe('sortRank', () => {
    it('orders by ascending `order` value regardless of the default desc argument', () => {
      const first = item({ order: 1 });
      const second = item({ order: 2 });
      expect(sortRank(first, second)).toBeLessThan(0);
    });

    it('reverses when order is asc', () => {
      const first = item({ order: 1 });
      const second = item({ order: 2 });
      expect(sortRank(first, second, 'asc')).toBeGreaterThan(0);
    });
  });

  describe('SortPipe over a full list of poll items', () => {
    let pipe: SortPipe;

    beforeEach(() => {
      pipe = new SortPipe();
    });

    it('sorts by vote count (desc), hidden items always last, ties broken oldest-first', () => {
      const items = [
        item({ id: 'two-votes', created: '100', voters: [voter('A'), voter('B')] }),
        item({ id: 'no-votes-old', created: '100', voters: [] }),
        item({ id: 'hidden-with-votes', created: '500', visible: false, voters: [voter('A'), voter('B'), voter('C')] }),
        item({ id: 'one-vote', created: '100', voters: [voter('A')] }),
        item({ id: 'no-votes-new', created: '300', voters: [] }),
      ];
      const result = pipe.transform(items, 'regular');
      // Hidden item sinks to the bottom no matter how many votes it has; the two
      // zero-vote items tie and fall back to sortDefault, which is oldest-first.
      expect(ids(result)).toEqual([
        'two-votes',
        'one-vote',
        'no-votes-old',
        'no-votes-new',
        'hidden-with-votes',
      ]);
    });

    it('smart-sorts SEEN/hidden items to the bottom, then by votes', () => {
      const items = [
        item({ id: 'seen', created: '100', reactions: [{ label: SEEN, users: [{ name: 'A' }] }] }),
        item({ id: 'top-voted', created: '100', voters: [voter('A'), voter('B')] }),
        item({ id: 'unvoted', created: '100', voters: [] }),
        item({ id: 'hidden', created: '100', visible: false }),
      ];
      const result = pipe.transform(items, 'smart');
      expect(ids(result)).toEqual(['top-voted', 'unvoted', 'seen', 'hidden']);
    });

    it('sorts a full list alphabetically by title (A-to-Z under the default "desc" order)', () => {
      const items = [
        item({ id: 'b', movieIndex: { title: 'Beta' } as any }),
        item({ id: 'd', movieIndex: { title: 'Delta' } as any }),
        item({ id: 'a', movieIndex: { title: 'Alpha' } as any }),
        item({ id: 'c', movieIndex: { title: 'Charlie' } as any }),
      ];
      const result = pipe.transform(items, 'title');
      expect(ids(result)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('sorts a full list by TMDb score (desc)', () => {
      const items = [
        item({ id: 'mid', movieIndex: { tmdbRating: 5 } as any }),
        item({ id: 'high', movieIndex: { tmdbRating: 9 } as any }),
        item({ id: 'none' }),
        item({ id: 'low', movieIndex: { tmdbRating: 2 } as any }),
      ];
      const result = pipe.transform(items, 'score');
      expect(ids(result)).toEqual(['high', 'mid', 'low', 'none']);
    });

    it('sorts a full list by release date (desc)', () => {
      const items = [
        item({ id: 'y1999', moviePollItemData: { releaseDate: '1999-03-31' } as any }),
        item({ id: 'y2020', moviePollItemData: { releaseDate: '2020-01-01' } as any }),
        item({ id: 'y1975', moviePollItemData: { releaseDate: '1975-06-20' } as any }),
      ];
      const result = pipe.transform(items, 'release');
      expect(ids(result)).toEqual(['y2020', 'y1999', 'y1975']);
    });

    it('sorts a full list by explicit rank (order ascending, regardless of default desc)', () => {
      const items = [
        item({ id: 'third', order: 2 }),
        item({ id: 'first', order: 0 }),
        item({ id: 'fourth', order: 3 }),
        item({ id: 'second', order: 1 }),
      ];
      const result = pipe.transform(items, 'ranked');
      expect(ids(result)).toEqual(['first', 'second', 'third', 'fourth']);
    });

    it('sorts a full list by point-budget totals when pointVoting is on', () => {
      const items = [
        item({ id: 'few-heavy-points', voters: [voter('A', 4)] }),
        item({ id: 'many-light-points', voters: [voter('B', 1), voter('C', 1)] }),
        item({ id: 'no-points', voters: [] }),
      ];
      const result = pipe.transform(items, 'smart', 'desc', undefined, true);
      expect(ids(result)).toEqual(['few-heavy-points', 'many-light-points', 'no-points']);
    });

    it('re-sorts a list to only reflect the selected voter filter\'s ballots', () => {
      const items = [
        item({ id: 'liked-by-everyone', voters: [voter('A'), voter('B'), voter('C')] }),
        item({ id: 'liked-by-A-only', voters: [voter('A')] }),
      ];
      const selectedVoters: PollItemVoter[] = [
        { name: 'A', selected: true },
        { name: 'B', selected: false },
        { name: 'C', selected: false },
      ];
      // Unfiltered, "liked-by-everyone" (3 votes) should win.
      expect(ids(pipe.transform([...items], 'smart'))).toEqual(['liked-by-everyone', 'liked-by-A-only']);
      // Filtered down to voter A only, both items have exactly 1 matching vote -> tie -> sortDefault (newest created first).
      const filtered = pipe.transform([...items], 'smart', 'desc', selectedVoters);
      expect(filtered.length).toBe(2);
    });

    it('returns a nullish input untouched', () => {
      expect(pipe.transform(undefined as any, 'title')).toBeUndefined();
    });
  });
});
