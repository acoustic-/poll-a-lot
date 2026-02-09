import loIsEqual from 'lodash.isequal';

export function isEqual<T>(x: T, y: T): boolean {
  return loIsEqual(x, y);
}

export const isDefined = <T>(v: T | undefined): v is T => !!v;
