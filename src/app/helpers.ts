import loIsEqual from 'lodash.isequal';

export function isEqual<T>(x: T, y: T): boolean {
  return loIsEqual(x, y);
}

export function isDefined<T>(value: T): boolean {
  return !!value;
}
