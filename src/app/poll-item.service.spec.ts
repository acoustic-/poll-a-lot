import { PollItem } from '../model/poll';
import { Movie, TMDbMovie } from '../model/tmdb';
import { User } from '../model/user';
import { UserService } from './user.service';
import { TMDbService } from './tmdb.service';
import { PollItemService, canAddPoint, canRemovePoint } from './poll-item.service';
import { of, Subject } from 'rxjs';

function pollItem(overrides: Partial<PollItem> = {}): PollItem {
  return {
    id: overrides.id ?? 'item-1',
    pollId: 'poll-1',
    name: 'Item',
    created: '100',
    voters: [],
    order: 0,
    ...overrides,
  } as PollItem;
}

describe('canAddPoint / canRemovePoint (ranked point-budget voting math)', () => {
  describe('canAddPoint', () => {
    it('allows adding a point when budget remains and no per-item cap applies', () => {
      expect(canAddPoint(2, 0)).toBeTrue();
    });

    it('blocks adding a point once the budget is fully spent', () => {
      expect(canAddPoint(0, 0)).toBeFalse();
    });

    it('blocks adding a point once the per-item cap is reached', () => {
      expect(canAddPoint(5, 2, 2)).toBeFalse();
    });

    it('allows adding a point below the per-item cap', () => {
      expect(canAddPoint(5, 1, 2)).toBeTrue();
    });

    it('treats a `null` maxPerItem as unlimited, same as `undefined`', () => {
      expect(canAddPoint(5, 100, null)).toBeTrue();
      expect(canAddPoint(5, 100, undefined)).toBeTrue();
    });

    it('treats a `maxPerItem` of exactly 0 as an active (impossible) cap, not unlimited', () => {
      // maxPerItem == null is the "unlimited" sentinel; 0 is a real, if degenerate, cap.
      expect(canAddPoint(5, 0, 0)).toBeFalse();
    });
  });

  describe('canRemovePoint', () => {
    it('allows removing a point when the voter currently has at least one', () => {
      expect(canRemovePoint(1)).toBeTrue();
    });

    it('blocks removing a point when the voter has none', () => {
      expect(canRemovePoint(0)).toBeFalse();
    });
  });
});

describe('PollItemService ranked-voting bookkeeping', () => {
  let service: PollItemService;
  let userServiceStub: Pick<UserService, 'getUser' | 'getUserOrOpenLogin' | 'usersAreEqual'>;
  let currentUser: User | undefined;
  let snackBarOpenSpy: jasmine.Spy;

  beforeEach(() => {
    currentUser = { id: 'u1', name: 'Alice' };
    userServiceStub = {
      getUser: () => currentUser,
      getUserOrOpenLogin: () => currentUser,
      usersAreEqual: (a, b) => !!a && !!b && (a.id && b.id ? a.id === b.id : a.name === b.name && a.localUserId === b.localUserId),
    };
    snackBarOpenSpy = jasmine.createSpy('open');
    service = new PollItemService(
      userServiceStub as UserService,
      { open: snackBarOpenSpy } as any,
      {} as any,
      {} as any,
      document,
      {} as any
    );
  });

  describe('hasVoted', () => {
    it('is false when the poll item has no voters', () => {
      expect(service.hasVoted(pollItem())).toBeFalse();
    });

    it('is true when the current user is among the voters', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.hasVoted(item)).toBeTrue();
    });

    it('is false when there is no current user to check against', () => {
      currentUser = undefined;
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.hasVoted(item)).toBeFalse();
    });
  });

  describe('getUserPoints', () => {
    it('returns 0 when the user has not voted on this item', () => {
      expect(service.getUserPoints(pollItem(), currentUser)).toBe(0);
    });

    it('returns the stored points for this user\'s voters[] entry', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 3 }] });
      expect(service.getUserPoints(item, currentUser)).toBe(3);
    });

    it('returns 0 for a legacy voters[] entry that predates ranked voting (no `points` field)', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.getUserPoints(item, currentUser)).toBe(0);
    });
  });

  describe('getUsedBudget', () => {
    it('sums this user\'s points across every poll item', () => {
      const items = [
        pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 2 }] }),
        pollItem({ id: 'b', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 3 }] }),
        pollItem({ id: 'c', voters: [{ id: 'u2', name: 'Bob', timestamp: 1, points: 5 }] }),
      ];
      expect(service.getUsedBudget(items, currentUser)).toBe(5);
    });

    it('returns 0 for an empty poll', () => {
      expect(service.getUsedBudget([], currentUser)).toBe(0);
    });
  });

  describe('allocatePoint guard clauses (no Firestore write reached)', () => {
    it('shows a snack and does not throw when the budget is already fully spent', async () => {
      const items = [pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 5 }] })];
      await service.allocatePoint('poll-1', items[0], items, 5, undefined, 1);
      expect(snackBarOpenSpy).toHaveBeenCalled();
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain('used all 5');
    });

    it('shows a snack and stops when adding would exceed the per-item cap', async () => {
      const item = pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 2 }] });
      await service.allocatePoint('poll-1', item, [item], 10, 2, 1);
      expect(snackBarOpenSpy).toHaveBeenCalled();
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain("can't put more than 2 points");
    });

    it('singularizes the per-item cap message when the cap is 1', async () => {
      const item = pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 1 }] });
      await service.allocatePoint('poll-1', item, [item], 10, 1, 1);
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain("can't put more than 1 point on");
    });

    it('silently no-ops removing a point the user does not have', async () => {
      const item = pollItem({ id: 'a', voters: [] });
      await service.allocatePoint('poll-1', item, [item], 5, undefined, -1);
      expect(snackBarOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe('getSimplifiedNewMoviePollItem', () => {
    const tmdbMovie: TMDbMovie = {
      id: 603,
      adult: false,
      video: false,
      title: 'The Matrix',
      original_title: 'The Matrix',
      overview: 'A hacker learns the truth.',
      release_date: '1999-03-30',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      genres: [],
      production_countries: [],
      popularity: 1,
      vote_count: 1,
      vote_average: 8.1,
      runtime: 136,
      tagline: 'Welcome to the Real World.',
      credits: { cast: [], crew: [] },
      images: {},
      recommendations: { results: [] } as any,
      release_dates: { results: [] },
    };

    const camelMovie: Movie = {
      id: 603,
      posterUrl: null,
      posterPath: '/poster.jpg',
      overview: 'A hacker learns the truth.',
      releaseDate: '1999-03-30',
      genres: [],
      imdbId: 'tt0133093',
      originalTitle: 'The Matrix',
      title: 'The Matrix',
      tagline: 'Welcome to the Real World.',
      backdropUrl: null,
      backdropPath: '/backdrop.jpg',
      popularity: 1,
      voteCount: 1,
      tmdbRating: 8.1,
      runtime: 136,
      originalObject: tmdbMovie,
    } as Movie;

    it('maps a snake_case TMDbMovie and a camelCase Movie to the same moviePollItemData shape', () => {
      const fromTmdb = service.getSimplifiedNewMoviePollItem(tmdbMovie);
      const fromMovie = service.getSimplifiedNewMoviePollItem(camelMovie);

      expect(fromTmdb.moviePollItemData).toEqual(fromMovie.moviePollItemData);
      expect(fromTmdb.moviePollItemData).toEqual({
        id: 603,
        title: 'The Matrix',
        originalTitle: 'The Matrix',
        tagline: 'Welcome to the Real World.',
        overview: 'A hacker learns the truth.',
        director: '-',
        productionCountry: '-',
        runtime: 136,
        releaseDate: '1999-03-30',
        posterPath: '/poster.jpg',
        backdropPath: '/backdrop.jpg',
        tmdbRating: 8.1,
      });
    });

    it('never leaves an undefined value in moviePollItemData (Firestore rejects them)', () => {
      const item = service.getSimplifiedNewMoviePollItem(tmdbMovie);
      for (const [key, value] of Object.entries(item.moviePollItemData)) {
        expect(value).not.toBeUndefined(`${key} should not be undefined`);
      }
    });
  });

  describe('addMoviePollItem', () => {
    const movie = { id: 603, title: 'The Matrix', release_date: '1999-03-30' } as unknown as TMDbMovie;
    let tmdbServiceStub: Pick<TMDbService, 'loadCombinedMovie' | 'movie2MovieIndex' | 'movie2MoviePollItemData'>;
    let snackBarRef: { onAction: () => Subject<void> };
    let onActionSubject: Subject<void>;

    beforeEach(() => {
      onActionSubject = new Subject<void>();
      snackBarRef = { onAction: () => onActionSubject };
      snackBarOpenSpy.and.returnValue(snackBarRef);
      tmdbServiceStub = {
        loadCombinedMovie: () => of({ ...movie, recommendations: { results: [] } } as any),
        movie2MovieIndex: () => ({ sentinel: 'index' } as any),
        movie2MoviePollItemData: () => ({ sentinel: 'data' } as any),
      };
      (service as any).tmdbService = tmdbServiceStub;
      spyOn(service, 'addPollItemFS').and.resolveTo();
      spyOn(service as any, 'uniqueId').and.returnValue('generated-id');
    });

    it('duplicate branch: emits undefined and writes nothing when the movie is already on the poll', async () => {
      const result$ = await service.addMoviePollItem(movie, 'poll-1', [603, 999], false, true);
      const emitted = await new Promise((resolve) => result$.subscribe(resolve));

      expect(emitted).toBeUndefined();
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain('already have this on the list');
      expect(service.addPollItemFS).not.toHaveBeenCalled();
    });

    it('confirm: false writes nothing (no snackbar, no Firestore write)', async () => {
      const result$ = await service.addMoviePollItem(movie, 'poll-1', [], false, false);
      const emitted = await new Promise((resolve) => result$.subscribe(resolve));

      expect(emitted).toBeUndefined();
      expect(snackBarOpenSpy).not.toHaveBeenCalled();
      expect(service.addPollItemFS).not.toHaveBeenCalled();
    });

    it('confirm: true writes exactly once, and only after the snackbar action fires', async () => {
      const result$ = await service.addMoviePollItem(movie, 'poll-1', [], false, true);
      const emissions: unknown[] = [];
      result$.subscribe((v) => emissions.push(v));

      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain('Are you sure you want to add');
      expect(service.addPollItemFS).not.toHaveBeenCalled();

      onActionSubject.next();

      expect(service.addPollItemFS).toHaveBeenCalledTimes(1);
      expect(emissions.length).toBe(1);
      expect((emissions[0] as PollItem).movieId).toBe(603);
    });

    // getNewMoviePollItem$ is private and only reachable through
    // addMoviePollItem's confirm branch — exercised here rather than cast
    // through `as any` to call it directly.
    it('the new poll item produced by the confirm branch has id/name/movieIndex/moviePollItemData/creator/order, with order equal to the existing item count', async () => {
      const existingMovieIds = [1, 2, 3];
      const result$ = await service.addMoviePollItem(movie, 'poll-1', existingMovieIds, false, true);
      const emissions: PollItem[] = [];
      result$.subscribe((v) => emissions.push(v as PollItem));

      onActionSubject.next();

      const newItem = emissions[0];
      expect(newItem.id).toBe('generated-id');
      expect(newItem.name).toBe('The Matrix (1999)');
      expect(newItem.movieId).toBe(603);
      expect(newItem.movieIndex).toEqual({ sentinel: 'index' } as any);
      expect(newItem.moviePollItemData).toEqual({ sentinel: 'data' } as any);
      // Not jasmine.objectContaining() — it throws under this project's esbuild
      // Karma bundle (see commit 0e89514) — assert the exact shape instead.
      expect(newItem.creator).toEqual({ id: 'u1', name: 'Alice' });
      expect(newItem.order).toBe(existingMovieIds.length);
    });
  });
});
