import { MovieCreditPipe } from './movie-credit.pipe';
import { Movie } from '../model/tmdb';

describe('MovieCreditPipe', () => {
  let pipe: MovieCreditPipe;

  beforeEach(() => {
    pipe = new MovieCreditPipe();
  });

  const movieWithCredits = {
    credits: {
      crew: [
        { id: 1, name: 'Ridley Scott', department: 'Directing', job: 'Director' },
        { id: 2, name: 'Some Writer', department: 'Writing', job: 'Screenplay' },
      ],
      cast: [
        { id: 3, name: 'Star One', order: 0 },
        { id: 4, name: 'Star Two', order: 1 },
      ],
    },
  } as unknown as Movie;

  it('returns undefined for a falsy movie', () => {
    expect(pipe.transform(undefined as unknown as Movie, 'directors')).toBeUndefined();
  });

  // Regression: movie-dialog seeds its movie$ with whatever was passed into
  // openMovie() (e.g. a raw TMDB search result) before the full combined
  // fetch — with credits — resolves, so this can't assume credits exists.
  it('returns undefined (not a crash) for a movie with no credits yet', () => {
    const partial = { id: 1, title: 'Loading...' } as unknown as Movie;
    expect(pipe.transform(partial, 'directors')).toBeUndefined();
  });

  it('returns an empty array (not a crash) for "with-job" when credits is missing', () => {
    const partial = { id: 1, title: 'Loading...' } as unknown as Movie;
    expect(pipe.transform(partial, 'directors', 'with-job')).toEqual([]);
  });

  it('joins director names', () => {
    expect(pipe.transform(movieWithCredits, 'directors')).toBe('Ridley Scott');
  });

  it('joins writer names', () => {
    expect(pipe.transform(movieWithCredits, 'writers')).toBe('Some Writer');
  });

  it('returns cast in billing order for "actors"', () => {
    expect(pipe.transform(movieWithCredits, 'actors', 'string', 1)).toBe('Star One');
  });

  it('returns "with-job" objects with job/name/id', () => {
    expect(pipe.transform(movieWithCredits, 'directors', 'with-job')).toEqual([
      { job: 'Director', name: 'Ridley Scott', id: 1 },
    ]);
  });
});
