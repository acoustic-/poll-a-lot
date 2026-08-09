import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SettingsComponent } from './settings.component';
import { UserService } from '../user.service';
import { NightModeService } from '../night-mode-service.service';
import { UserIdentityService } from '../user-identity.service';
import { TMDbService } from '../tmdb.service';
import { RecentSearchesService } from '../recent-searches.service';
import { LetterboxdService } from '../letterboxd.service';
import { MovieDialogService } from '../movie-dialog.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LetterboxdMemberLink, UserPreferences } from '../../model/user';
import { FilmSummary } from '../../model/letterboxd';

// ---------------------------------------------------------------------------
// Service stubs — only the members SettingsComponent actually reads
// ---------------------------------------------------------------------------

function makeUserServiceStub(): jasmine.SpyObj<Pick<
  UserService,
  | 'user$'
  | 'userData$'
  | 'selectedWatchProviders$'
  | 'selectedRegion$'
  | 'letterboxdMember$'
  | 'setPreferences'
  | 'openLoginDialog'
  | 'setDisplayName'
  | 'setSharePhoto'
  | 'setRegion'
  | 'deletePublicProfile'
  | 'logout'
>> {
  const stub = jasmine.createSpyObj('UserService', [
    'setPreferences',
    'openLoginDialog',
    'setDisplayName',
    'setSharePhoto',
    'setRegion',
    'deletePublicProfile',
    'logout',
  ]);
  stub['user$'] = new BehaviorSubject(undefined);
  stub['userData$'] = new BehaviorSubject(undefined);
  stub['selectedWatchProviders$'] = new BehaviorSubject<number[]>([]);
  stub['selectedRegion$'] = new BehaviorSubject<string>('FI');
  stub['letterboxdMember$'] = new BehaviorSubject(undefined);
  stub.setPreferences.and.returnValue(Promise.resolve());
  return stub;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function setup(storedUsers?: string[]) {
  const userServiceStub = makeUserServiceStub();
  const movieDialogServiceStub = { openMovie: jasmine.createSpy('openMovie') };
  if (storedUsers !== undefined) {
    userServiceStub['userData$'].next({
      id: 'uid-1',
      watchlist: [],
      region: 'FI',
      watchproviders: [],
      latestPolls: [],
      favoritePolls: [],
      preferences: { letterboxFollowUsers: storedUsers } as UserPreferences,
    });
  }

  TestBed.configureTestingModule({
    imports: [
      SettingsComponent,
      NoopAnimationsModule,
    ],
    providers: [
      { provide: UserService, useValue: userServiceStub },
      {
        provide: NightModeService,
        useValue: { night$: of({ state: false }), set: jasmine.createSpy('set') },
      },
      {
        provide: UserIdentityService,
        useValue: {
          resolve$: jasmine.createSpy('resolve$').and.returnValue(of(new Map())),
          invalidate: jasmine.createSpy('invalidate'),
        },
      },
      {
        provide: TMDbService,
        useValue: {
          loadMovieProviders: jasmine.createSpy('loadMovieProviders').and.returnValue(of([])),
        },
      },
      {
        provide: RecentSearchesService,
        useValue: { clear: jasmine.createSpy('clear') },
      },
      { provide: MatBottomSheet, useValue: { open: jasmine.createSpy('open') } },
      { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
      {
        provide: LetterboxdService,
        useValue: {
          searchMembers: jasmine.createSpy('searchMembers').and.returnValue(of([])),
          getMemberProfile: jasmine.createSpy('getMemberProfile').and.returnValue(of({ optedOut: false })),
        },
      },
      { provide: MovieDialogService, useValue: movieDialogServiceStub },
    ],
    schemas: [NO_ERRORS_SCHEMA],
  });

  const fixture = TestBed.createComponent(SettingsComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  return { component, userServiceStub, movieDialogServiceStub };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsComponent.saveLetterboxUsers()', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('splits a comma-separated string into trimmed usernames', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('user1, user2, user3');

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: ['user1', 'user2', 'user3'],
    });
  });

  it('trims whitespace around each username', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('  user1 ,  user2 ');

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: ['user1', 'user2'],
    });
  });

  it('produces an empty array for a blank string', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('');

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: [],
    });
  });

  it('produces an empty array for a whitespace-only string', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('   ');

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: [],
    });
  });

  it('produces a single-element array for one username with no commas', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('user1');

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: ['user1'],
    });
  });

  it('passes a parsed array to setPreferences, not the raw string', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers('alpha, beta');

    const [callArg] = userServiceStub.setPreferences.calls.mostRecent().args as [{ letterboxFollowUsers: unknown }];
    expect(Array.isArray(callArg.letterboxFollowUsers)).toBeTrue();
    expect(callArg.letterboxFollowUsers).toEqual(['alpha', 'beta']);
  });

  it('treats null the same as an empty string', () => {
    const { component, userServiceStub } = setup();

    component.saveLetterboxUsers(null);

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxFollowUsers: [],
    });
  });
});

describe('SettingsComponent click-to-edit name', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts closed and opens editing on startEditingName()', () => {
    const { component } = setup();

    expect(component.editingName).toBeFalse();

    component.startEditingName();

    expect(component.editingName).toBeTrue();
  });

  it('commitName() saves the new value and closes the editor', () => {
    const { component, userServiceStub } = setup();
    component.displayNameControl.setValue('Alice');

    component.startEditingName();
    component.displayNameControl.setValue('Bob');
    component.commitName();

    expect(component.editingName).toBeFalse();
    expect(userServiceStub.setDisplayName).toHaveBeenCalledOnceWith('Bob');
  });

  it('commitName() is a no-op when not currently editing', () => {
    const { component, userServiceStub } = setup();

    component.commitName();

    expect(userServiceStub.setDisplayName).not.toHaveBeenCalled();
  });

  it('commitName() does not save an invalid (blank) name', () => {
    const { component, userServiceStub } = setup();
    component.displayNameControl.setValue('Alice');

    component.startEditingName();
    component.displayNameControl.setValue('');
    component.commitName();

    expect(userServiceStub.setDisplayName).not.toHaveBeenCalled();
  });

  it('commitName() reverts to the pre-edit value and closes the editor on an invalid name', () => {
    const { component, userServiceStub } = setup();
    component.displayNameControl.setValue('Alice');

    component.startEditingName();
    component.displayNameControl.setValue('');
    component.commitName();

    expect(component.editingName).toBeFalse();
    expect(component.displayNameControl.value).toBe('Alice');
    expect(component.displayNameControl.valid).toBeTrue();
    expect(userServiceStub.setDisplayName).not.toHaveBeenCalled();
  });

  it('cancelEditingName() reverts to the pre-edit value and closes the editor without saving', () => {
    const { component, userServiceStub } = setup();
    component.displayNameControl.setValue('Alice');

    component.startEditingName();
    component.displayNameControl.setValue('Something else entirely');
    component.cancelEditingName();

    expect(component.editingName).toBeFalse();
    expect(component.displayNameControl.value).toBe('Alice');
    expect(userServiceStub.setDisplayName).not.toHaveBeenCalled();
  });
});

describe('SettingsComponent Letterboxd account linking', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('linkLetterboxdMember() saves an unverified link and clears search state', () => {
    const { component, userServiceStub } = setup();
    component.letterboxdQuery.setValue('acoustic');
    component.showLetterboxdPasteField = true;

    component.linkLetterboxdMember({
      lid: '3roL',
      username: 'acoustic',
      displayName: 'Jari K.',
      avatarUrl: 'https://a.ltrbxd.com/avatar.jpg',
    });

    const [callArg] = userServiceStub.setPreferences.calls.mostRecent().args as [
      { letterboxdMember: LetterboxdMemberLink }
    ];
    expect(callArg.letterboxdMember.lid).toBe('3roL');
    expect(callArg.letterboxdMember.username).toBe('acoustic');
    expect(callArg.letterboxdMember.displayName).toBe('Jari K.');
    expect(callArg.letterboxdMember.avatarUrl).toBe('https://a.ltrbxd.com/avatar.jpg');
    expect(callArg.letterboxdMember.verified).toBeFalse();
    expect(component.letterboxdQuery.value).toBe('');
    expect(component.showLetterboxdPasteField).toBeFalse();
  });

  it('linkLetterboxdMember() omits avatarUrl/displayName entirely when the candidate has none, rather than setting them to undefined', () => {
    // Regression: a boxd.it-resolved candidate has no avatar/display name.
    // Setting the keys to `undefined` (vs. omitting them) used to survive
    // into the stored preference object and break the Firestore write.
    const { component, userServiceStub } = setup();

    component.linkLetterboxdMember({ lid: '3roL', username: '3roL', displayName: '', avatarUrl: undefined });

    const [callArg] = userServiceStub.setPreferences.calls.mostRecent().args as [
      { letterboxdMember: LetterboxdMemberLink }
    ];
    expect('avatarUrl' in callArg.letterboxdMember).toBeFalse();
  });

  it('unlinkLetterboxdMember() clears the stored preference', () => {
    const { component, userServiceStub } = setup();

    component.unlinkLetterboxdMember();

    expect(userServiceStub.setPreferences).toHaveBeenCalledOnceWith({
      letterboxdMember: undefined,
    });
  });

  it('resolveLetterboxdPaste() links directly from a boxd.it short link, with no username to show', () => {
    const { component, userServiceStub } = setup();

    component.resolveLetterboxdPaste('https://boxd.it/3roL');

    const [callArg] = userServiceStub.setPreferences.calls.mostRecent().args as [
      { letterboxdMember: LetterboxdMemberLink }
    ];
    expect(callArg.letterboxdMember.lid).toBe('3roL');
    expect(callArg.letterboxdMember.username).toBe('3roL');
  });

  it('resolveLetterboxdPaste() hands a full profile link off to the search field as a username', () => {
    const { component, userServiceStub } = setup();
    component.showLetterboxdPasteField = true;

    component.resolveLetterboxdPaste('https://letterboxd.com/acoustic/');

    expect(userServiceStub.setPreferences).not.toHaveBeenCalled();
    expect(component.letterboxdQuery.value).toBe('acoustic');
    expect(component.showLetterboxdPasteField).toBeFalse();
  });

  it('resolveLetterboxdPaste() hands a bare username off to the search field', () => {
    const { component, userServiceStub } = setup();

    component.resolveLetterboxdPaste('acoustic');

    expect(userServiceStub.setPreferences).not.toHaveBeenCalled();
    expect(component.letterboxdQuery.value).toBe('acoustic');
  });

  it('resolveLetterboxdPaste() rejects unrecognizable input without linking', () => {
    const { component, userServiceStub } = setup();

    component.resolveLetterboxdPaste('not a link or username!!');

    expect(userServiceStub.setPreferences).not.toHaveBeenCalled();
  });

  it('resolveLetterboxdPaste() treats blank input as unrecognizable', () => {
    const { component, userServiceStub } = setup();

    component.resolveLetterboxdPaste('   ');

    expect(userServiceStub.setPreferences).not.toHaveBeenCalled();
  });
});

describe('SettingsComponent Letterboxd profile panel', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('histogramFullStars() returns one entry per whole point', () => {
    const { component } = setup();
    expect(component.histogramFullStars(3).length).toBe(3);
    expect(component.histogramFullStars(3.5).length).toBe(3);
    expect(component.histogramFullStars(0.5).length).toBe(0);
  });

  it('histogramHasHalfStar() is true only for .5 increments', () => {
    const { component } = setup();
    expect(component.histogramHasHalfStar(3.5)).toBeTrue();
    expect(component.histogramHasHalfStar(0.5)).toBeTrue();
    expect(component.histogramHasHalfStar(3)).toBeFalse();
    expect(component.histogramHasHalfStar(5)).toBeFalse();
  });

  it('dayOfYear() returns 1 for Jan 1 and 365 for Dec 31 in a non-leap year', () => {
    const { component } = setup();
    expect(component.dayOfYear(new Date(2025, 0, 1))).toBe(1);
    expect(component.dayOfYear(new Date(2025, 11, 31))).toBe(365);
  });

  it('dayOfYear() is unaffected by time-of-day (regression: local-midnight ms arithmetic broke across a DST change)', () => {
    const { component } = setup();
    const earlyMorning = new Date(2025, 5, 15, 0, 30);
    const lateNight = new Date(2025, 5, 15, 23, 30);
    expect(component.dayOfYear(earlyMorning)).toBe(166); // June 15 is day 166 of 2025
    expect(component.dayOfYear(lateNight)).toBe(166);
  });

  it('movieADayProgress() reports how far ahead of a one-a-day pace the count is', () => {
    const { component } = setup();
    // Day 41 of the year (Feb 10, 2025), 50 films logged — 9 ahead of pace.
    const result = component.movieADayProgress(50, new Date(2025, 1, 10));
    expect(result.dayOfYear).toBe(41);
    expect(result.aheadBy).toBe(9);
    expect(result.pct).toBe(1);
    expect(result.state).toBe('ahead');
  });

  it('movieADayProgress() reports a fractional pct and negative aheadBy when behind pace', () => {
    const { component } = setup();
    const result = component.movieADayProgress(10, new Date(2025, 1, 10)); // day 41
    expect(result.aheadBy).toBe(10 - 41);
    expect(result.pct).toBeCloseTo(10 / 41, 5);
    expect(result.state).toBe('behind');
  });

  it('movieADayProgress() reports the "onpace" state and a full gauge when exactly on pace', () => {
    const { component } = setup();
    const result = component.movieADayProgress(41, new Date(2025, 1, 10)); // day 41
    expect(result.aheadBy).toBe(0);
    expect(result.state).toBe('onpace');
    expect(result.pct).toBe(1);
  });

  it('movieADayProgress() resolves the lobby-card film/quote/backdrop for the current state', () => {
    const { component } = setup();
    const ahead = component.movieADayProgress(50, new Date(2025, 1, 10));
    expect(ahead.film).toContain('Top Gun');
    expect(ahead.backdrop).toContain('reel-pace/ahead-top-gun');

    const onPace = component.movieADayProgress(41, new Date(2025, 1, 10));
    expect(onPace.film).toContain('Star Wars');
    expect(onPace.backdrop).toContain('reel-pace/on-pace-star-wars');

    const behind = component.movieADayProgress(10, new Date(2025, 1, 10));
    expect(behind.film).toContain('Alice in Wonderland');
    expect(behind.backdrop).toContain('reel-pace/behind-alice');
  });

  it('movieADayProgress() clamps pct to 1 even when ahead of pace, for <gauge-ring>\'s [progress] input', () => {
    const { component } = setup();

    const onPace = component.movieADayProgress(41, new Date(2025, 1, 10));
    expect(onPace.pct).toBe(1);

    const ahead = component.movieADayProgress(90, new Date(2025, 1, 10));
    expect(ahead.pct).toBe(1);

    const behind = component.movieADayProgress(10, new Date(2025, 1, 10));
    expect(behind.pct).toBeCloseTo(10 / 41, 5);
  });

  it('yearOverYearDelta() subtracts last year from this year', () => {
    const { component } = setup();
    expect(component.yearOverYearDelta(41, 29)).toBe(12);
    expect(component.yearOverYearDelta(20, 25)).toBe(-5);
  });

  it('yearOverYearDelta() is undefined when either count is missing', () => {
    const { component } = setup();
    expect(component.yearOverYearDelta(undefined, 29)).toBeUndefined();
    expect(component.yearOverYearDelta(41, undefined)).toBeUndefined();
  });

  it('countEntries() excludes the counts already shown as hero headline stats', () => {
    const { component } = setup();

    const entries = component.countEntries({
      filmsInDiaryThisYear: 41,
      filmsInDiaryLastYear: 29,
      films: 812,
      watchlist: 63,
      ratings: 1204,
      reviews: 86,
    });

    expect(entries.map((e) => e.key)).toEqual(['ratings', 'reviews']);
  });

  it('countEntries() humanizes camelCase keys into readable labels', () => {
    const { component } = setup();

    const entries = component.countEntries({ listsCreated: 3, following: 29 });

    expect(entries).toEqual([
      { key: 'listsCreated', label: 'Lists Created', value: 3 },
      { key: 'following', label: 'Following', value: 29 },
    ]);
  });

  it('countEntries() drops non-numeric or undefined values', () => {
    const { component } = setup();

    const entries = component.countEntries({ ratings: 5, missing: undefined });

    expect(entries).toEqual([{ key: 'ratings', label: 'Ratings', value: 5 }]);
  });

  it('filmTmdbId() extracts the numeric tmdb id from a favourite film\'s links', () => {
    const { component } = setup();

    const id = component.filmTmdbId({
      links: [
        { type: 'letterboxd', id: 'abcd', url: 'https://letterboxd.com/film/x/' },
        { type: 'tmdb', id: '550', url: 'https://themoviedb.org/movie/550' },
      ],
    } as FilmSummary);

    expect(id).toBe(550);
  });

  it('filmTmdbId() is undefined when there is no tmdb link', () => {
    const { component } = setup();

    const id = component.filmTmdbId({ links: [{ type: 'letterboxd', id: 'abcd', url: '' }] } as FilmSummary);

    expect(id).toBeUndefined();
  });

  it('openFavoriteFilm() opens the movie dialog for the favourite film\'s tmdb id', () => {
    const { component, movieDialogServiceStub } = setup();

    component.openFavoriteFilm({
      links: [{ type: 'tmdb', id: '550', url: 'https://themoviedb.org/movie/550' }],
    } as FilmSummary);

    const arg = movieDialogServiceStub.openMovie.calls.mostRecent().args[0];
    expect(arg.movieId).toBe(550);
    expect(arg.editable).toBeFalse();
    expect(arg.isVoteable).toBeFalse();
  });

  it('openFavoriteFilm() does nothing when the favourite film has no tmdb link', () => {
    const { component, movieDialogServiceStub } = setup();

    component.openFavoriteFilm({ links: [{ type: 'letterboxd', id: 'abcd', url: '' }] } as FilmSummary);

    expect(movieDialogServiceStub.openMovie).not.toHaveBeenCalled();
  });

  it('letterboxdWatchlistUrl() builds the member\'s watchlist page URL', () => {
    const { component } = setup();
    expect(component.letterboxdWatchlistUrl('acoustic')).toBe('https://letterboxd.com/acoustic/watchlist/');
  });
});
