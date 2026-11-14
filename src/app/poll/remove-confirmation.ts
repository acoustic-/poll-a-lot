import { PollItem } from "../../model/poll";
import { UserRef, isIdentified, isSameIdentifiedUser } from "../user-identity";

export type RemoveConfirmation =
  | { kind: "snackbar"; message: string }
  | {
      kind: "dialog";
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
    };

/**
 * How to ask before deleting a poll item. Taking away someone else's suggestion
 * is permanent and deliberate, so it gets a dialog that must be answered; your
 * own item, or one whose creator can't be identified (a legacy item with no
 * `creator`, or a creator with neither a Google `id` nor a `localUserId`), falls
 * to a lightweight snackbar. A creator identified by either kind of sign-in is
 * "someone else's" unless it is the current user — an anonymous viewer included.
 */
export function removeConfirmationFor(
  pollItem: Pick<PollItem, "name" | "creator">,
  currentUser: UserRef | undefined
): RemoveConfirmation {
  const name = pollItem.name ? pollItem.name : "the chosen option";
  const someoneElses =
    isIdentified(pollItem.creator) && !isSameIdentifiedUser(pollItem.creator, currentUser);

  if (someoneElses) {
    return {
      kind: "dialog",
      title: `Remove ${name}?`,
      message: `${pollItem.creator!.name ? `'${pollItem.creator!.name}'` : "Someone else"} added this. Removing it deletes it from the poll for everyone, and it can't be undone.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
    };
  }
  return { kind: "snackbar", message: `Do you want to remove ${name}?` };
}
