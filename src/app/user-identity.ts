import { User } from "../model/user";

/** Exactly the fields persisted into a poll item's voters[]/creator, or a poll's
 *  owner. Deliberately narrow: everything presentational (display name overrides,
 *  profile photo) is resolved live at render time instead, so a `User` field added
 *  later does not silently leak into Firestore just by being spread in.
 *
 *  Since 2.0 every writer is a Firebase Auth user (Google or Anonymous) and `id`
 *  is their uid. `localUserId` only appears on refs written before 2.0 by
 *  nickname users who had no auth at all. */
export interface UserRef {
  id?: string;
  localUserId?: string;
  name?: string;
}

/** Who is looking: the signed-in user plus the older identities their browser (or
 *  their Google account's `users/{uid}` doc) remembers. Only the runtime `User`
 *  carries these; they are never persisted into a ref. */
export type Viewer = Pick<User, "id" | "name" | "localUserId" | "legacyLocalUserIds" | "previousUids">;

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

/** A Google account, as opposed to a nickname (anonymous) one. Poll creation,
 *  watchlists, settings and "My polls" need this. */
export function isGoogleAccount(user: Pick<User, "id" | "isAnonymous"> | undefined): boolean {
  return !!user?.id && !user.isAnonymous;
}

function legacyIdsOf(viewer: Viewer): string[] {
  return [...(viewer.legacyLocalUserIds ?? []), ...(viewer.localUserId ? [viewer.localUserId] : [])];
}

/**
 * "Is this ref me?" for votes, reactions and points: the current uid, a uid this
 * person used before (a nickname account they left by signing in to an existing
 * Google account), or, for a pre-2.0 ref with no `id`, a legacy `localUserId`
 * this browser remembers. Never a name.
 */
export function isMe(ref: UserRef | undefined, viewer: Viewer | undefined): boolean {
  if (!ref || !viewer) return false;
  if (ref.id) return ref.id === viewer.id || (viewer.previousUids ?? []).includes(ref.id);
  return !!ref.localUserId && legacyIdsOf(viewer).includes(ref.localUserId);
}

/**
 * Strict "same person" check for permissions (remove/edit an item, poll owner).
 * Stricter than `isMe`: a ref with an `id` matches only the *current* uid, because
 * that is all the Firestore rules accept, so the UI never offers something the
 * server would refuse. A pre-2.0 ref with no `id` matches a legacy `localUserId`
 * this browser remembers (the rules can't check those either way). Never a name.
 */
export function isSameIdentifiedUser(creator: UserRef | undefined, viewer: Viewer | undefined): boolean {
  if (!creator || !viewer) return false;
  if (creator.id) return creator.id === viewer.id;
  return !!creator.localUserId && legacyIdsOf(viewer).includes(creator.localUserId);
}

/** True when the ref carries something to identify its person by. */
export function isIdentified(ref: UserRef | undefined): boolean {
  return !!(ref && (ref.id || ref.localUserId));
}
