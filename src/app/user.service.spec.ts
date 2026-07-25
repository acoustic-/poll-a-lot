import { TestBed, inject } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

import { UserService } from './user.service';
import { User } from '../model/user';

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
});
