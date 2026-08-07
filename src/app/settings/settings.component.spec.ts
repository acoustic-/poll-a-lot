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
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserPreferences } from '../../model/user';

// ---------------------------------------------------------------------------
// Service stubs — only the members SettingsComponent actually reads
// ---------------------------------------------------------------------------

function makeUserServiceStub(): jasmine.SpyObj<Pick<
  UserService,
  | 'user$'
  | 'userData$'
  | 'selectedWatchProviders$'
  | 'selectedRegion$'
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
  stub.setPreferences.and.returnValue(Promise.resolve());
  return stub;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function setup(storedUsers?: string[]) {
  const userServiceStub = makeUserServiceStub();
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
    ],
    schemas: [NO_ERRORS_SCHEMA],
  });

  const fixture = TestBed.createComponent(SettingsComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  return { component, userServiceStub };
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
