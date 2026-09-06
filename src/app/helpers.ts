import loIsEqual from 'lodash.isequal';

export function isEqual<T>(x: T, y: T): boolean {
  return loIsEqual(x, y);
}

export const isDefined = <T>(v: T | undefined): v is T => !!v;

// Firestore's SDK rejects any `undefined` field value ("Unsupported field
// value: undefined") unless `ignoreUndefinedProperties` is set, which this app
// doesn't. Drop undefined keys (shallow) before a setDoc/addDoc so an optional,
// never-filled field like a poll's description doesn't make the whole write
// throw — i.e. so "optional" stays optional.
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

// "Timothy, John and Reynold" — comma-joined with a final "and" rather than an
// Oxford comma.
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
