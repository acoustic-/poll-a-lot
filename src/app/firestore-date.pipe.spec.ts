import { FirestoreDatePipe } from './firestore-date.pipe';

describe('FirestoreDatePipe', () => {
  let pipe: FirestoreDatePipe;

  beforeEach(() => {
    pipe = new FirestoreDatePipe();
  });

  it('converts a Firestore { seconds } timestamp to a Date', () => {
    // 2026-01-15T00:00:00.000Z
    const seconds = 1768435200;
    expect(pipe.transform({ seconds })).toEqual(new Date(seconds * 1000));
  });

  it('regression: does not render 1970 for a real poll date', () => {
    const seconds = 1768435200;
    const result = pipe.transform({ seconds });
    expect(result.getFullYear()).toBe(2026);
  });

  it('passes a Date through unchanged', () => {
    const date = new Date('2026-03-01T00:00:00.000Z');
    expect(pipe.transform(date)).toBe(date);
  });

  it('treats a bare number as milliseconds', () => {
    const millis = 1768435200000;
    expect(pipe.transform(millis)).toEqual(new Date(millis));
  });

  it('returns null for null/undefined', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });

  it('returns null for a malformed object', () => {
    expect(pipe.transform({} as any)).toBeNull();
  });
});
