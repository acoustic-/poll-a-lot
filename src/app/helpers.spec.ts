import { isDefined, isEqual, joinWithAnd, stripUndefined } from './helpers';

describe('helpers', () => {
  describe('isEqual', () => {
    it('deep-compares objects rather than doing a reference check', () => {
      expect(isEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBeTrue();
    });

    it('detects a difference nested inside an array', () => {
      expect(isEqual({ a: [1, 2] }, { a: [1, 3] })).toBeFalse();
    });
  });

  describe('isDefined', () => {
    it('rejects undefined, null, and falsy values', () => {
      expect(isDefined(undefined)).toBeFalse();
      expect(isDefined(null)).toBeFalse();
      expect(isDefined(0)).toBeFalse();
      expect(isDefined('')).toBeFalse();
    });

    it('accepts any truthy value', () => {
      expect(isDefined('a')).toBeTrue();
      expect(isDefined(1)).toBeTrue();
      expect(isDefined({})).toBeTrue();
    });
  });

  describe('joinWithAnd', () => {
    it('returns an empty string for an empty list', () => {
      expect(joinWithAnd([])).toBe('');
    });

    it('returns the single item untouched', () => {
      expect(joinWithAnd(['Timothy'])).toBe('Timothy');
    });

    it('joins two items with "and" and no comma', () => {
      expect(joinWithAnd(['Timothy', 'John'])).toBe('Timothy and John');
    });

    it('comma-joins three or more items with a final "and" (no Oxford comma)', () => {
      expect(joinWithAnd(['Timothy', 'John', 'Reynold'])).toBe('Timothy, John and Reynold');
    });
  });

  describe('stripUndefined', () => {
    it('drops keys whose value is undefined', () => {
      expect(stripUndefined({ name: 'Poll', description: undefined, date: undefined }))
        .toEqual({ name: 'Poll' });
    });

    it('keeps null, empty string and falsy-but-defined values', () => {
      expect(stripUndefined({ a: null, b: '', c: 0, d: false }))
        .toEqual({ a: null, b: '', c: 0, d: false });
    });
  });
});
