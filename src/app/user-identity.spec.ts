import { toUserRef } from './user-identity';
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
