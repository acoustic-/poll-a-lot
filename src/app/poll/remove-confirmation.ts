import { PollItem } from "../../model/poll";

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
 * own item, a legacy item with no `creator` recorded, or an item of an unknown
 * (anonymous) viewer's own all fall to a lightweight snackbar — except that an
 * anonymous viewer against an item that *has* a creator is "someone else's".
 */
export function removeConfirmationFor(
  pollItem: Pick<PollItem, "name" | "creator">,
  currentUserId: string | undefined
): RemoveConfirmation {
  const name = pollItem.name ? pollItem.name : "the chosen option";
  const someoneElses =
    !!pollItem.creator?.id && pollItem.creator.id !== currentUserId;

  if (someoneElses) {
    return {
      kind: "dialog",
      title: `Remove ${name}?`,
      message: `'${pollItem.creator!.name}' added this. Removing it deletes it from the poll for everyone, and it can't be undone.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
    };
  }
  return { kind: "snackbar", message: `Do you want to remove ${name}?` };
}
