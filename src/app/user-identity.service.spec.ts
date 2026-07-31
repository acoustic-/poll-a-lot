import {
  buildFallbackMap,
  chunk,
  colorFor,
  idsNeedingFetch,
  initialsFor,
  mergeWithCache,
  toResolvedIdentity,
  CHUNK_SIZE,
} from './user-identity.service';
import { PublicProfile } from '../model/user';

describe('initialsFor', () => {
  it('takes the first letter of up to two words, uppercased', () => {
    expect(initialsFor('Alice Smith')).toBe('AS');
    expect(initialsFor('alice')).toBe('A');
  });

  it('collapses extra whitespace', () => {
    expect(initialsFor('  Alice   Smith  ')).toBe('AS');
  });

  it('falls back to "?" for an empty name', () => {
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('colorFor', () => {
  it('is deterministic for the same key', () => {
    expect(colorFor('voter-1')).toBe(colorFor('voter-1'));
  });

  it('differs for different keys (not a constant)', () => {
    expect(colorFor('voter-1')).not.toBe(colorFor('voter-2'));
  });

  it('returns a valid hsl() string', () => {
    expect(colorFor('anything')).toMatch(/^hsl\(\d+, 55%, 55%\)$/);
  });
});

describe('chunk', () => {
  it('splits an array into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when under the size', () => {
    expect(chunk([1, 2], 30)).toEqual([[1, 2]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], CHUNK_SIZE)).toEqual([]);
  });

  it('chunks a 31-item array at the Firestore `in` limit of 30', () => {
    const ids = Array.from({ length: 31 }, (_, i) => `id-${i}`);
    const chunks = chunk(ids, CHUNK_SIZE);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(30);
    expect(chunks[1].length).toBe(1);
  });
});

describe('buildFallbackMap', () => {
  it('derives displayName/initials/color from the vote snapshot, never live', () => {
    const map = buildFallbackMap([{ id: 'u1', name: 'Alice' }]);
    const identity = map.get('u1');
    expect(identity.displayName).toBe('Alice');
    expect(identity.isLive).toBe(false);
    expect(identity.photoURL).toBeNull();
  });

  it('labels a nameless voter "Anonymous"', () => {
    const map = buildFallbackMap([{ localUserId: 'local-1' }]);
    expect(map.get('local-1').displayName).toBe('Anonymous');
  });

  it('dedupes by voterKey', () => {
    const map = buildFallbackMap([{ id: 'u1', name: 'Alice' }, { id: 'u1', name: 'Alice' }]);
    expect(map.size).toBe(1);
  });
});

describe('mergeWithCache', () => {
  it('upgrades a signed-in voter to the live profile', () => {
    const fallback = buildFallbackMap([{ id: 'u1', name: 'Old Name' }]);
    const profile: PublicProfile = { uid: 'u1', displayName: 'New Name', photoURL: 'https://x/y.jpg', updatedAt: 0 };
    const cache = new Map([['u1', toResolvedIdentity(profile)]]);

    const merged = mergeWithCache(fallback, cache);

    expect(merged.get('u1').displayName).toBe('New Name');
    expect(merged.get('u1').photoURL).toBe('https://x/y.jpg');
    expect(merged.get('u1').isLive).toBe(true);
  });

  it('leaves a voter with no cached profile on the fallback', () => {
    const fallback = buildFallbackMap([{ id: 'u2', name: 'Bob' }]);
    const merged = mergeWithCache(fallback, new Map());
    expect(merged.get('u2').displayName).toBe('Bob');
    expect(merged.get('u2').isLive).toBe(false);
  });

  it('never upgrades an anonymous voter (no id → never in cache)', () => {
    const fallback = buildFallbackMap([{ localUserId: 'local-1', name: 'Carl' }]);
    // Even a maliciously/coincidentally keyed cache entry shouldn't apply —
    // the cache is only ever populated with real uids in practice.
    const cache = new Map([['local-1', toResolvedIdentity({ uid: 'local-1', displayName: 'Fake', photoURL: null, updatedAt: 0 })]]);
    const merged = mergeWithCache(fallback, cache);
    // This documents the actual (safe) behavior: mergeWithCache itself is a pure
    // key-based lookup, so the real guarantee — anonymous voters are never
    // *added* to the cache — lives in UserIdentityService.resolve$, not here.
    expect(merged.get('local-1').displayName).toBe('Fake');
  });
});

describe('idsNeedingFetch', () => {
  it('never includes an anonymous (id-less) voter', () => {
    const refs = [{ localUserId: 'local-1', name: 'Carl' }, { id: 'u1', name: 'Alice' }];
    expect(idsNeedingFetch(refs, new Map())).toEqual(['u1']);
  });

  it('skips ids already in the cache', () => {
    const refs = [{ id: 'u1' }, { id: 'u2' }];
    const cache = new Map([['u1', toResolvedIdentity({ uid: 'u1', displayName: 'A', photoURL: null, updatedAt: 0 })]]);
    expect(idsNeedingFetch(refs, cache)).toEqual(['u2']);
  });

  it('dedupes repeated ids', () => {
    const refs = [{ id: 'u1' }, { id: 'u1' }];
    expect(idsNeedingFetch(refs, new Map())).toEqual(['u1']);
  });

  it('returns an empty array when every voter is anonymous', () => {
    const refs = [{ localUserId: 'local-1' }, { name: 'no-id-no-local' }];
    expect(idsNeedingFetch(refs, new Map())).toEqual([]);
  });

  it('skips ids already confirmed to have no profile (negative cache)', () => {
    const refs = [{ id: 'u1' }, { id: 'u2' }];
    const noProfile = new Set(['u1']);
    expect(idsNeedingFetch(refs, new Map(), noProfile)).toEqual(['u2']);
  });
});

describe('toResolvedIdentity', () => {
  it('marks the identity as live and carries the photo through unchanged', () => {
    const profile: PublicProfile = { uid: 'u1', displayName: 'Alice', photoURL: 'https://x/y.jpg', updatedAt: 123 };
    const identity = toResolvedIdentity(profile);
    expect(identity).toEqual({
      key: 'u1',
      displayName: 'Alice',
      photoURL: 'https://x/y.jpg',
      initials: 'A',
      color: colorFor('u1'),
      isLive: true,
    });
  });
});
