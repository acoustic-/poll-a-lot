import { TestBed, inject } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { deleteApp, getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { Subject } from 'rxjs';

import { UserService } from './user.service';
import { WelcomeDialogComponent } from './welcome-dialog/welcome-dialog.component';
import { User, UserData, UserPreferences, LetterboxdMemberLink } from '../model/user';
import { environment } from '../environments/environment';

const TEST_APP_NAME = 'user-service-spec';
const TEST_FIREBASE_CONFIG = {
  apiKey: 'test-api-key',
  authDomain: 'test.firebaseapp.com',
  projectId: 'test-project',
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        provideFirebaseApp(() => initializeApp(TEST_FIREBASE_CONFIG, TEST_APP_NAME)),
        provideFirestore(() => getFirestore(getApp(TEST_APP_NAME))),
        provideAuth(() => getAuth(getApp(TEST_APP_NAME))),
      ],
    });
    service = TestBed.inject(UserService);
  });

  // UserService's constructor subscribes to onAuthStateChanged (a live
  // listener) against this fake project, and beforeEach above never tears
  // any of this down. Left open across 288 tests, these accumulate and keep
  // retrying their connections in the background after the run reports
  // done, starving Karma's browser<->runner heartbeat and tripping the
  // default 30s browserNoActivityTimeout.
  //
  // ngOnDestroy() must run before deleteApp(): deleteApp() on an app with
  // both Firestore and Auth initialized hangs indefinitely while a listener
  // from either is still attached (firebase/firebase-js-sdk#7816) — closing
  // the Angular-level subscription first is what actually detaches it.
  afterEach(async () => {
    service.ngOnDestroy();
    await deleteApp(getApp(TEST_APP_NAME));
  });

  it('should be created', inject([UserService], (s: UserService) => {
    expect(s).toBeTruthy();
  }));

  describe('usersAreEqual', () => {
    it('returns false when either user is undefined', () => {
      expect(service.usersAreEqual(undefined, { name: 'A' })).toBeFalse();
      expect(service.usersAreEqual({ name: 'A' }, undefined)).toBeFalse();
    });

    it('compares by id when both users have one, ignoring name', () => {
      const a: User = { id: 'u1', name: 'Alice' };
      const b: User = { id: 'u1', name: 'Alice (renamed)' };
      expect(service.usersAreEqual(a, b)).toBeTrue();
    });

    it('treats different ids as different users even if names match', () => {
      const a: User = { id: 'u1', name: 'Alice' };
      const b: User = { id: 'u2', name: 'Alice' };
      expect(service.usersAreEqual(a, b)).toBeFalse();
    });

    it('falls back to name+localUserId when either user lacks an id', () => {
      const a: User = { name: 'Alice', localUserId: 'local-1' };
      const b: User = { name: 'Alice', localUserId: 'local-1' };
      expect(service.usersAreEqual(a, b)).toBeTrue();
    });

    it('treats same name with different localUserId as different anonymous users', () => {
      const a: User = { name: 'Alice', localUserId: 'local-1' };
      const b: User = { name: 'Alice', localUserId: 'local-2' };
      expect(service.usersAreEqual(a, b)).toBeFalse();
    });

    it('never equates a Google user with a weak user, even with a matching name', () => {
      const google: User = { id: 'u1', name: 'Alice' };
      const weak: User = { name: 'Alice', localUserId: 'local-1' };
      // Only one side has an id, so the `a.id && b.id` branch is skipped and this
      // falls to the name+localUserId comparison — which the Google side never has.
      expect(service.usersAreEqual(google, weak)).toBeFalse();
      expect(service.usersAreEqual(weak, google)).toBeFalse();
    });
  });

  describe('getUserOrOpenLogin', () => {
    it('returns the current user without opening the dialog when already logged in', () => {
      service.user$.next({ id: 'u1', name: 'Alice' });
      spyOn(service, 'openLoginDialog');
      const result = service.getUserOrOpenLogin();
      expect(result).toEqual({ id: 'u1', name: 'Alice' });
      expect(service.openLoginDialog).not.toHaveBeenCalled();
    });

    it('opens the login dialog and returns undefined when logged out', () => {
      service.user$.next(undefined);
      spyOn(service, 'openLoginDialog');
      const result = service.getUserOrOpenLogin();
      expect(result).toBeUndefined();
      expect(service.openLoginDialog).toHaveBeenCalled();
    });

    it('requires a strong (id-bearing) user when requireStrongAuth is true', () => {
      service.user$.next({ name: 'Anonymous', localUserId: 'local-1' });
      spyOn(service, 'openLoginDialog');
      const result = service.getUserOrOpenLogin(undefined, true);
      expect(result).toBeUndefined();
      expect(service.openLoginDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('toggleWatchProvider', () => {
    it('adds a provider id that is not yet selected', () => {
      service.selectedWatchProviders$.next([1, 2]);
      service.toggleWatchProvider(3);
      expect(service.selectedWatchProviders$.getValue()).toEqual([1, 2, 3]);
    });

    it('removes a provider id that is already selected', () => {
      service.selectedWatchProviders$.next([1, 2, 3]);
      service.toggleWatchProvider(2);
      expect(service.selectedWatchProviders$.getValue()).toEqual([1, 3]);
    });
  });

  describe('isLoggedIn / isGoogleUser', () => {
    it('reports logged out state when no user is set', () => {
      service.user$.next(undefined);
      expect(service.isLoggedIn()).toBeFalse();
      expect(service.isGoogleUser()).toBeFalse();
    });

    it('reports logged in but not a Google user for a local-only user', () => {
      service.user$.next({ name: 'Anon', localUserId: 'local-1' });
      expect(service.isLoggedIn()).toBeTrue();
      expect(service.isGoogleUser()).toBeFalse();
    });

    it('reports a Google user once an id is present', () => {
      service.user$.next({ id: 'u1', name: 'Alice' });
      expect(service.isLoggedIn()).toBeTrue();
      expect(service.isGoogleUser()).toBeTrue();
    });
  });

  describe('letterboxFollowUsers$', () => {
    it('emits environment.letterboxFollowUsers when userData has no preferences', () => {
      const emitted: string[][] = [];
      const sub = service.letterboxFollowUsers$.subscribe(v => emitted.push(v));

      service.userData$.next(undefined);

      sub.unsubscribe();
      expect(emitted).toContain(environment.letterboxFollowUsers);
    });

    it('emits environment.letterboxFollowUsers when preferences.letterboxFollowUsers is an empty array', () => {
      const emitted: string[][] = [];
      const sub = service.letterboxFollowUsers$.subscribe(v => emitted.push(v));

      service.userData$.next({
        id: 'u1', watchlist: [], region: 'FI', watchproviders: [], latestPolls: [], favoritePolls: [],
        preferences: { letterboxFollowUsers: [] },
      } as UserData);

      sub.unsubscribe();
      expect(emitted[emitted.length - 1]).toEqual(environment.letterboxFollowUsers);
    });

    it('emits the user-supplied array when preferences.letterboxFollowUsers is non-empty', () => {
      const emitted: string[][] = [];
      const sub = service.letterboxFollowUsers$.subscribe(v => emitted.push(v));

      service.userData$.next({
        id: 'u1', watchlist: [], region: 'FI', watchproviders: [], latestPolls: [], favoritePolls: [],
        preferences: { letterboxFollowUsers: ['alice', 'bob'] },
      } as UserData);

      sub.unsubscribe();
      expect(emitted[emitted.length - 1]).toEqual(['alice', 'bob']);
    });

    it('does not re-emit when userData changes but letterboxFollowUsers content is identical', () => {
      const emitted: string[][] = [];
      const sub = service.letterboxFollowUsers$.subscribe(v => emitted.push(v));

      const makeUserData = (): UserData => ({
        id: 'u1', watchlist: [], region: 'FI', watchproviders: [], latestPolls: [], favoritePolls: [],
        preferences: { letterboxFollowUsers: ['alice'] },
      });

      service.userData$.next(makeUserData());
      const countAfterFirst = emitted.length;
      service.userData$.next(makeUserData());

      sub.unsubscribe();
      expect(emitted.length).toBe(countAfterFirst);
    });
  });

  describe('getPreferences / setPreferences', () => {
    // Reach into the private localStorage field so tests can exercise the
    // localStorage code paths (afterNextRender never fires in TestBed).
    interface ServiceWithStorage { localStorage: Storage }

    let fakeStorage: jasmine.SpyObj<Storage>;

    beforeEach(() => {
      const store: Record<string, string> = {};
      fakeStorage = jasmine.createSpyObj<Storage>('Storage', ['getItem', 'setItem', 'removeItem']);
      fakeStorage.getItem.and.callFake((key: string) => store[key] ?? null);
      fakeStorage.setItem.and.callFake((key: string, value: string) => { store[key] = value; });
      fakeStorage.removeItem.and.callFake((key: string) => { delete store[key]; });
      (service as unknown as ServiceWithStorage).localStorage = fakeStorage;
    });

    it('returns an empty object when no preferences have been set', () => {
      service.userData$.next(undefined);
      expect(service.getPreferences()).toEqual({});
    });

    it('returns preferences from userData$ when available', () => {
      const prefs: UserPreferences = { condensedMovieView: true, hideWatchedMovies: false };
      service.userData$.next({
        id: 'u1', watchlist: [], region: 'FI', watchproviders: [], latestPolls: [], favoritePolls: [],
        preferences: prefs,
      } as UserData);
      expect(service.getPreferences()).toEqual(prefs);
    });

    it('persists a preference to localStorage and round-trips it via getPreferences', async () => {
      service.userData$.next(undefined);
      await service.setPreferences({ condensedMovieView: true });
      expect(fakeStorage.setItem).toHaveBeenCalledWith(
        'user_preferences',
        JSON.stringify({ condensedMovieView: true }),
      );
      expect(service.getPreferences()).toEqual({ condensedMovieView: true });
    });

    it('does not clobber unrelated keys when a partial update is written', async () => {
      // Seed existing preferences via userData$ so the merge step has something to work with.
      service.userData$.next({
        id: 'u1', watchlist: [], region: 'FI', watchproviders: [], latestPolls: [], favoritePolls: [],
        preferences: { hideWatchedMovies: true },
      } as UserData);

      await service.setPreferences({ condensedMovieView: true });

      const saved = service.getPreferences();
      expect(saved.hideWatchedMovies).toBeTrue();
      expect(saved.condensedMovieView).toBeTrue();
    });

    it('round-trips letterboxFollowUsers through setPreferences and getPreferences', async () => {
      service.userData$.next(undefined);
      const users = ['alice', 'bob'];
      await service.setPreferences({ letterboxFollowUsers: users });
      expect(service.getPreferences().letterboxFollowUsers).toEqual(users);
    });

    it('drops undefined-valued fields nested inside an object preference, not just top-level keys', async () => {
      // Regression: a boxd.it-linked Letterboxd account has no avatarUrl, so
      // letterboxdMember carries an undefined-valued field one level down —
      // Firestore's updateDoc() (and, for parity, the JSON string this falls
      // back to) rejects undefined at any depth, not just the top level.
      service.userData$.next(undefined);
      const link: LetterboxdMemberLink = {
        lid: '3roL',
        username: 'acoustic',
        avatarUrl: undefined,
        verified: false,
        linkedAt: 123,
      };

      await service.setPreferences({ letterboxdMember: link });

      const saved = service.getPreferences().letterboxdMember;
      expect(saved).toEqual({ lid: '3roL', username: 'acoustic', verified: false, linkedAt: 123 });
      expect(saved && 'avatarUrl' in saved).toBeFalse();
    });
  });

  describe('welcome dialog gating', () => {
    // Reach into the private localStorage/authResolved$ fields, same pattern
    // as the getPreferences/setPreferences suite above.
    interface ServiceInternals { localStorage: Storage; authResolved$: Subject<boolean> }

    let fakeStorage: jasmine.SpyObj<Storage>;

    // openWelcomeDialogIfFirstVisit() only decides once auth state is known
    // (see authResolved$ on UserService) — call after openWelcomeDialogIfFirstVisit()
    // to simulate onAuthStateChanged's first callback resolving.
    function resolveAuth(): void {
      (service as unknown as ServiceInternals).authResolved$.next(true);
    }

    beforeEach(() => {
      const store: Record<string, string> = {};
      fakeStorage = jasmine.createSpyObj<Storage>('Storage', ['getItem', 'setItem', 'removeItem']);
      fakeStorage.getItem.and.callFake((key: string) => store[key] ?? null);
      fakeStorage.setItem.and.callFake((key: string, value: string) => { store[key] = value; });
      fakeStorage.removeItem.and.callFake((key: string) => { delete store[key]; });
      (service as unknown as ServiceInternals).localStorage = fakeStorage;
    });

    it('hasSeenWelcome() is false before markWelcomeSeen() has ever been called', () => {
      expect(service.hasSeenWelcome()).toBeFalse();
    });

    it('markWelcomeSeen() persists the flag so hasSeenWelcome() becomes true', () => {
      service.markWelcomeSeen();
      expect(service.hasSeenWelcome()).toBeTrue();
    });

    describe('openWelcomeDialogIfFirstVisit', () => {
      it('waits for auth state to resolve before deciding anything', () => {
        // The real (fake-project) Firebase auth check this UserService kicks
        // off in its constructor is still in flight and may resolve after
        // this spec's assertions run — give the spy a real dialogRef-shaped
        // return value so that late, out-of-band resolution doesn't crash
        // with "Cannot read properties of undefined (reading 'afterClosed')"
        // once it eventually fires.
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open').and.returnValue({
          afterClosed: () => new Subject<void>().asObservable(),
        });

        service.openWelcomeDialogIfFirstVisit();

        expect(service.dialog.open).not.toHaveBeenCalled();
      });

      it('does not open a dialog when welcome has already been seen', () => {
        service.markWelcomeSeen();
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open');

        service.openWelcomeDialogIfFirstVisit();
        resolveAuth();

        expect(service.dialog.open).not.toHaveBeenCalled();
      });

      it('does not open a dialog for a user who is already signed in with Google', () => {
        service.user$.next({ id: 'u1', name: 'Alice' });
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open');

        service.openWelcomeDialogIfFirstVisit();
        resolveAuth();

        expect(service.dialog.open).not.toHaveBeenCalled();
      });

      it('opens WelcomeDialogComponent on a first visit and marks it seen once closed', () => {
        const afterClosed$ = new Subject<void>();
        const dialogRefStub = { afterClosed: () => afterClosed$.asObservable() };
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open').and.returnValue(dialogRefStub);

        service.openWelcomeDialogIfFirstVisit();
        resolveAuth();

        expect(service.dialog.open).toHaveBeenCalledTimes(1);
        expect((service.dialog.open as jasmine.Spy).calls.first().args[0]).toBe(WelcomeDialogComponent);
        expect(service.hasSeenWelcome()).toBeFalse();

        afterClosed$.next(undefined);
        afterClosed$.complete();

        expect(service.hasSeenWelcome()).toBeTrue();
      });

      it('closes the dialog once the user signs in with a Google account', () => {
        const afterClosed$ = new Subject<void>();
        const dialogRefStub = {
          afterClosed: () => afterClosed$.asObservable(),
          close: jasmine.createSpy('close'),
        };
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open').and.returnValue(dialogRefStub);

        service.openWelcomeDialogIfFirstVisit();
        resolveAuth();
        service.user$.next({ id: 'u1', name: 'Alice' });

        expect(dialogRefStub.close).toHaveBeenCalled();
      });

      it('does not close the dialog for an anonymous (local-only) user', () => {
        const afterClosed$ = new Subject<void>();
        const dialogRefStub = {
          afterClosed: () => afterClosed$.asObservable(),
          close: jasmine.createSpy('close'),
        };
        (service.dialog as unknown as { open: jasmine.Spy }).open = jasmine.createSpy('open').and.returnValue(dialogRefStub);

        service.openWelcomeDialogIfFirstVisit();
        resolveAuth();
        service.user$.next({ name: 'Anonymous', localUserId: 'local-1' });

        expect(dialogRefStub.close).not.toHaveBeenCalled();
      });
    });
  });
});
