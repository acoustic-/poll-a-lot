import { Pipe, PipeTransform } from "@angular/core";

/** A Firestore Timestamp as it comes back over `docData`/`collectionData` — a
 *  plain `{ seconds, nanoseconds }` object, not the SDK's `Timestamp` class. */
export interface FirestoreTimestampLike {
  seconds: number;
}

@Pipe({ name: "firestoreDate", standalone: true, pure: true })
export class FirestoreDatePipe implements PipeTransform {
  transform(
    value: FirestoreTimestampLike | Date | number | null | undefined
  ): Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    return typeof value.seconds === "number"
      ? new Date(value.seconds * 1000)
      : null;
  }
}
