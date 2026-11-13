import { isIdentified, isSameIdentifiedUser, toUserRef } from './user-identity';
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
