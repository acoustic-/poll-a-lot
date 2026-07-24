import loIsEqual from 'lodash.isequal';

export function isEqual<T>(x: T, y: T): boolean {
  return loIsEqual(x, y);
}

export const isDefined = <T>(v: T | undefined): v is T => !!v;

// "Timothy, John and Reynold" — comma-joined with a final "and" rather than an
// Oxford comma.
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
