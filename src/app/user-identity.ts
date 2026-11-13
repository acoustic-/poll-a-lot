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
 * shared Google `id` or, for a creator who added the item without Google, a
 * shared `localUserId` — never on a name. The name is
 * deliberately not part of it, so a rename doesn't cost anyone their item. (A
 * local user who later signs in with Google carries no `localUserId` and so is
 * not recognised; the poll's owner can still remove the item.)
 */
export function isSameIdentifiedUser(creator: UserRef | undefined, viewer: UserRef | undefined): boolean {
  if (!creator || !viewer) return false;
  if (creator.id && viewer.id) return creator.id === viewer.id;
  // A Google-authenticated creator is only ever matched by a Google-authenticated
  // viewer: the same browser signed out still carries their `localUserId`, which
  // must not hand a logged-out visitor their items.
  if (creator.id) return false;
  return !!creator.localUserId && creator.localUserId === viewer.localUserId;
}

/** True when the ref carries something to identify its person by. */
export function isIdentified(ref: UserRef | undefined): boolean {
  return !!(ref && (ref.id || ref.localUserId));
}
