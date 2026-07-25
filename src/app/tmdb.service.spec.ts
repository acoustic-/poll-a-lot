import { TestBed, inject } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

import { TMDbService } from './tmdb.service';
import { UserService } from './user.service';
import { LocalCacheService } from './local-cache.service';
import { LocalStorageService } from './local-storage.service';
import { LetterboxdService } from './letterboxd.service';

const TEST_APP_NAME = 'tmdb-service-spec';
const TEST_FIREBASE_CONFIG = {
  apiKey: 'test-api-key',
  authDomain: 'test.firebaseapp.com',
  projectId: 'test-project',
};

describe('MovieService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TMDbService,
        UserService,
        LocalCacheService,
        LocalStorageService,
        LetterboxdService,
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFirebaseApp(() => initializeApp(TEST_FIREBASE_CONFIG, TEST_APP_NAME)),
        provideFirestore(() => getFirestore(getApp(TEST_APP_NAME))),
        provideAuth(() => getAuth(getApp(TEST_APP_NAME))),
        provideFunctions(() => getFunctions(getApp(TEST_APP_NAME))),
      ]
    });
  });

  it('should be created', inject([TMDbService], (service: TMDbService) => {
    expect(service).toBeTruthy();
  }));

  describe('movie2MovieIndex', () => {
    it('maps the fields a poll item needs for sorting/display off a Movie', inject(
      [TMDbService],
      (service: TMDbService) => {
        const movie: any = {
          id: 42,
          title: 'The Matrix',
          tmdbRating: 8.7,
          releaseDate: '1999-03-31',
          originalObject: { genres: [{ id: 28 }, { id: 878 }] },
        };
        const index = service.movie2MovieIndex(movie);
        expect(index.title).toBe('The Matrix');
        expect(index.tmdbRating).toBe(8.7);
        expect(index.genres).toEqual([28, 878]);
      }
    ));
  });
});
