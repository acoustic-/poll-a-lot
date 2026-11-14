import { isGoogleAccount, isIdentified, isMe, isSameIdentifiedUser, toUserRef } from './user-identity';
import { User } from '../model/user';

describe('toUserRef', () => {
  it('carries over id, localUserId, and name', () => {
    const user: User = { id: 'u1', localUserId: 'l1', name: 'Alice' };
    expect(toUserRef(user)).toEqual({ id: 'u1', localUserId: 'l1', name: 'Alice' });
  });

  it('omits undefined keys rather than writing them as undefined', () => {
    const user: User = { name: 'Alice' };
    const ref = toUserRef(user);
    expect(ref).toEqual({ name: 'Alice' });
    expect('id' in ref).toBe(false);
    expect('localUserId' in ref).toBe(false);
  });

  it('drops useSuffix (vestigial, never persisted)', () => {
    const user: User = { name: 'Alice', useSuffix: 2 };
    expect(toUserRef(user)).toEqual({ name: 'Alice' });
  });

  it('regression: a field added to User later does not leak through by default', () => {
    const user = { name: 'Alice', photoURL: 'https://lh3.googleusercontent.com/leak' } as User;
    expect(toUserRef(user)).toEqual({ name: 'Alice' });
  });

  it('handles an empty user', () => {
    expect(toUserRef({})).toEqual({});
  });

  it('handles an undefined user (no one logged in yet)', () => {
    expect(toUserRef(undefined)).toEqual({});
  });
});

describe('isSameIdentifiedUser', () => {
  it('matches on a shared Google id, whatever the names', () => {
    expect(isSameIdentifiedUser({ id: 'g1', name: 'Ann' }, { id: 'g1', name: 'Anna' })).toBe(true);
    expect(isSameIdentifiedUser({ id: 'g1' }, { id: 'g2' })).toBe(false);
  });

  it('matches on a shared localUserId, including after a rename or a Google sign-in', () => {
    expect(isSameIdentifiedUser({ localUserId: 'l1', name: 'Sam' }, { localUserId: 'l1', name: 'Samuel' })).toBe(true);
    expect(isSameIdentifiedUser({ localUserId: 'l1', name: 'Sam' }, { id: 'g1', localUserId: 'l1', name: 'Samuel' })).toBe(true);
  });

  it('does not let a signed-out visitor on the same browser claim a Google creator\'s items', () => {
    expect(isSameIdentifiedUser({ id: 'g1', localUserId: 'l1', name: 'Ann' }, { localUserId: 'l1', name: 'Ann' })).toBe(false);
  });

  it('never matches on a name alone', () => {
    expect(isSameIdentifiedUser({ name: 'Sam' }, { name: 'Sam' })).toBe(false);
    expect(isSameIdentifiedUser({ localUserId: 'l1', name: 'Sam' }, { localUserId: 'l2', name: 'Sam' })).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isSameIdentifiedUser(undefined, { id: 'g1' })).toBe(false);
    expect(isSameIdentifiedUser({ id: 'g1' }, undefined)).toBe(false);
  });
});

describe('isIdentified', () => {
  it('needs a Google id or a localUserId', () => {
    expect(isIdentified({ id: 'g1' })).toBe(true);
    expect(isIdentified({ localUserId: 'l1' })).toBe(true);
    expect(isIdentified({ name: 'Sam' })).toBe(false);
    expect(isIdentified(undefined)).toBe(false);
  });
});

describe('isGoogleAccount', () => {
  it('is false for a nickname (anonymous) account and for no one', () => {
    expect(isGoogleAccount({ id: 'u1', isAnonymous: true })).toBe(false);
    expect(isGoogleAccount(undefined)).toBe(false);
    expect(isGoogleAccount({})).toBe(false);
  });

  it('is true for a user with an id who is not anonymous', () => {
    expect(isGoogleAccount({ id: 'g1' })).toBe(true);
  });
});

describe('isMe', () => {
  it('matches the current uid', () => {
    expect(isMe({ id: 'u1', name: 'Sam' }, { id: 'u1' })).toBe(true);
    expect(isMe({ id: 'u2' }, { id: 'u1' })).toBe(false);
  });

  it('matches a uid the person left behind when signing in to an existing Google account', () => {
    expect(isMe({ id: 'old-nickname-uid' }, { id: 'g1', previousUids: ['old-nickname-uid'] })).toBe(true);
    expect(isMe({ id: 'someone-else' }, { id: 'g1', previousUids: ['old-nickname-uid'] })).toBe(false);
  });

  it('matches a pre-2.0 vote by its legacy localUserId, but never a ref that has an id', () => {
    const viewer = { id: 'u1', legacyLocalUserIds: ['l1'] };
    expect(isMe({ localUserId: 'l1', name: 'Sam' }, viewer)).toBe(true);
    expect(isMe({ localUserId: 'l2', name: 'Sam' }, viewer)).toBe(false);
    expect(isMe({ id: 'u9', localUserId: 'l1' }, viewer)).toBe(false);
  });

  it('never matches on a name alone', () => {
    expect(isMe({ name: 'Sam' }, { id: 'u1', name: 'Sam' })).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(isMe(undefined, { id: 'u1' })).toBe(false);
    expect(isMe({ id: 'u1' }, undefined)).toBe(false);
  });
});

describe('isSameIdentifiedUser with nickname accounts', () => {
  it('accepts only the current uid for an item with a creator id, not a previous uid', () => {
    expect(isSameIdentifiedUser({ id: 'u1' }, { id: 'u1' })).toBe(true);
    expect(isSameIdentifiedUser({ id: 'old' }, { id: 'g1', previousUids: ['old'] })).toBe(false);
  });

  it('recognises a pre-2.0 creator by a legacy id the browser remembers', () => {
    expect(isSameIdentifiedUser({ localUserId: 'l1' }, { id: 'u1', legacyLocalUserIds: ['l1'] })).toBe(true);
    expect(isSameIdentifiedUser({ localUserId: 'l2' }, { id: 'u1', legacyLocalUserIds: ['l1'] })).toBe(false);
  });
});
