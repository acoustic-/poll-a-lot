import { LetterboxdItem } from '../../model/letterboxd';
import { PollItem } from '../../model/poll';
import { Movie, TMDbMovie } from '../../model/tmdb';
import { getPollMovies, getSimpleMovieTitle, openImdb, openLetterboxd, openTmdb } from './movie-helpers';

describe('movie-helpers', () => {
  describe('getSimpleMovieTitle', () => {
    it('appends the release year from `releaseDate`', () => {
      expect(getSimpleMovieTitle({ title: 'The Matrix', releaseDate: '1999-03-31' } as unknown as Movie)).toBe('The Matrix (1999)');
    });

    it('falls back to `release_date` for raw TMDb movie objects', () => {
      expect(getSimpleMovieTitle({ title: 'Inception', release_date: '2010-07-16' } as unknown as TMDbMovie)).toBe('Inception (2010)');
    });
  });

  describe('getPollMovies', () => {
    function item(movieId?: number): PollItem {
      return { id: 'x', pollId: 'p', name: 'n', created: '1', voters: [], order: 0, movieId } as PollItem;
    }

    it('extracts the movieId from each poll item', () => {
      expect(getPollMovies([item(1), item(2), item(3)])).toEqual([1, 2, 3]);
    });

    it('filters out poll items without a movieId', () => {
      expect(getPollMovies([item(1), item(undefined), item(2)])).toEqual([1, 2]);
    });

    it('returns an empty array for an undefined/empty list', () => {
      expect(getPollMovies(undefined)).toEqual([]);
      expect(getPollMovies([])).toEqual([]);
    });
  });

  describe('openImdb / openTmdb / openLetterboxd', () => {
    beforeEach(() => {
      spyOn(window, 'open');
    });

    it('opens the IMDb title page in a new tab by default', () => {
      openImdb('tt0133093');
      expect(window.open).toHaveBeenCalledWith('https://m.imdb.com/title/tt0133093', '_blank');
    });

    it('opens the requested IMDb entity type', () => {
      openImdb('nm0000206', 'name');
      expect(window.open).toHaveBeenCalledWith('https://m.imdb.com/name/nm0000206', '_blank');
    });

    it('opens the TMDb movie page by default', () => {
      openTmdb(603);
      expect(window.open).toHaveBeenCalledWith('https://www.themoviedb.org/movie/603', '_blank');
    });

    it('opens the matching Letterboxd link when present', () => {
      openLetterboxd({ links: [{ type: 'letterboxd', url: 'https://letterboxd.com/film/the-matrix/' }] } as unknown as LetterboxdItem);
      expect(window.open).toHaveBeenCalledWith('https://letterboxd.com/film/the-matrix/', '_blank');
    });

    it('does nothing when the item has links but none of type "letterboxd"', () => {
      openLetterboxd({ links: [{ type: 'tmdb', url: 'https://themoviedb.org/x' }] } as unknown as LetterboxdItem);
      expect(window.open).not.toHaveBeenCalled();
    });

    it('does nothing when no letterboxd item is given', () => {
      openLetterboxd(undefined);
      expect(window.open).not.toHaveBeenCalled();
    });
  });
});
