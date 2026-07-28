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

export function toUserRef(user: User | undefined): UserRef {
  const ref: UserRef = {};
  if (!user) return ref;
  if (user.id) ref.id = user.id;
  if (user.localUserId) ref.localUserId = user.localUserId;
  if (user.name) ref.name = user.name;
  return ref;
}
