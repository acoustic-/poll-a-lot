import { User } from "../model/user";

/** Exactly the fields persisted into a poll item's voters[]/creator, or a poll's
 *  owner. Deliberately narrow: everything presentational (display name overrides,
 *  profile photo) is resolved live at render time instead, so a `User` field added
 *  later does not silently leak into Firestore just by being spread in. */
export interface UserRef {
  id?: string;
  localUserId?: string;
  name?: string;
}

export function voterKey(voter: { id?: string; localUserId?: string; name?: string }): string {
  return voter.id || voter.localUserId || voter.name || "";
}

export function toUserRef(user: User | undefined): UserRef {
  const ref: UserRef = {};
  if (!user) return ref;
  if (user.id) ref.id = user.id;
  if (user.localUserId) ref.localUserId = user.localUserId;
  if (user.name) ref.name = user.name;
  return ref;
}

/**
 * Strict "same person" check for permission decisions (who may remove an item).
 * Unlike `UserService.usersAreEqual`, which falls back to comparing names and so
 * lets two unidentified people called "Sam" match, this says yes only on a
 * shared Google `id` or a shared `localUserId` — never on a name. The name is
 * deliberately not part of it: someone who renamed themselves, or signed in with
 * Google after adding the item, is still the same person.
 */
export function isSameIdentifiedUser(a: UserRef | undefined, b: UserRef | undefined): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return !!a.localUserId && a.localUserId === b.localUserId;
}

/** True when the ref carries something to identify its person by. */
export function isIdentified(ref: UserRef | undefined): boolean {
  return !!(ref && (ref.id || ref.localUserId));
}
