import { TestBed, inject } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { deleteApp, getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TMDbService } from './tmdb.service';
import { UserService } from './user.service';
import { LocalCacheService } from './local-cache.service';
import { LocalStorageService } from './local-storage.service';
import { LetterboxdService } from './letterboxd.service';
import { TMDbMovie } from '../model/tmdb';
import { TMDbSeries } from '../model/tmdb';

class PassthroughCacheService {
  observable<T>(_key: string, obs$: Observable<T>, _expires?: number): Observable<T> {
    return obs$;
  }
}

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

  // See the matching afterEach in user.service.spec.ts. TMDbService injects
  // UserService directly, so constructing it here (every test above does,
  // via `inject([TMDbService, ...])`) also opens UserService's live
  // onAuthStateChanged listener against this fake project. ngOnDestroy()
  // must close that before deleteApp(), which otherwise hangs indefinitely
  // while a Firestore/Auth listener is still attached
  // (firebase/firebase-js-sdk#7816).
  afterEach(async () => {
    TestBed.inject(UserService).ngOnDestroy();
    await deleteApp(getApp(TEST_APP_NAME));
  });

  it('should be created', inject([TMDbService], (service: TMDbService) => {
    expect(service).toBeTruthy();
  }));

  describe('searchMovies include_adult param', () => {
    it('sends include_adult=false when getPreferences returns includeAdult false',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          spyOn(userService, 'getPreferences').and.returnValue({ includeAdult: false });

          service.searchMovies('matrix').subscribe();

          const req = httpMock.expectOne((r) => r.url.includes('/search/movie'));
          expect(req.request.urlWithParams).toContain('include_adult=false');
          req.flush({ results: [] as TMDbMovie[] });
          httpMock.verify();
        }
      )
    );

    it('sends include_adult=true when getPreferences returns includeAdult true',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          spyOn(userService, 'getPreferences').and.returnValue({ includeAdult: true });

          service.searchMovies('matrix').subscribe();

          const req = httpMock.expectOne((r) => r.url.includes('/search/movie'));
          expect(req.request.urlWithParams).toContain('include_adult=true');
          req.flush({ results: [] as TMDbMovie[] });
          httpMock.verify();
        }
      )
    );
  });

  describe('searchSeries include_adult param', () => {
    it('sends include_adult=false when getPreferences returns includeAdult false',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          spyOn(userService, 'getPreferences').and.returnValue({ includeAdult: false });

          service.searchSeries('breaking').subscribe();

          const req = httpMock.expectOne((r) => r.url.includes('/search/tv'));
          expect(req.request.urlWithParams).toContain('include_adult=false');
          req.flush({ results: [] as TMDbSeries[] });
          httpMock.verify();
        }
      )
    );

    it('sends include_adult=true when getPreferences returns includeAdult true',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          spyOn(userService, 'getPreferences').and.returnValue({ includeAdult: true });

          service.searchSeries('breaking').subscribe();

          const req = httpMock.expectOne((r) => r.url.includes('/search/tv'));
          expect(req.request.urlWithParams).toContain('include_adult=true');
          req.flush({ results: [] as TMDbSeries[] });
          httpMock.verify();
        }
      )
    );
  });

  describe('region-reactive loaders', () => {
    beforeEach(() => {
      TestBed.overrideProvider(LocalCacheService, { useValue: new PassthroughCacheService() });
    });

    it('loadPopularMovies re-requests with updated region param when selectedRegion$ changes',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          userService.selectedRegion$.next('US');

          service.loadPopularMovies(1).subscribe();

          const firstReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/popular') && r.urlWithParams.includes('region=US')
          );
          firstReq.flush({ results: [] as TMDbMovie[] });

          userService.selectedRegion$.next('DE');

          const secondReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/popular') && r.urlWithParams.includes('region=DE')
          );
          secondReq.flush({ results: [] as TMDbMovie[] });

          httpMock.verify();
        }
      )
    );

    it('loadPopularMovies cancels the in-flight request when selectedRegion$ switches before it completes',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          userService.selectedRegion$.next('US');

          service.loadPopularMovies(1).subscribe();

          // One request is pending for US — do NOT flush it.
          const pendingReqs = httpMock.match((r) =>
            r.url.includes('/movie/popular') && r.urlWithParams.includes('region=US')
          );
          expect(pendingReqs.length).toBe(1);

          // Switching region unsubscribes from the previous inner observable (switchMap),
          // abandoning the US request. A new request for DE is issued.
          userService.selectedRegion$.next('DE');

          // The original US request was cancelled — verify it was never answered
          // by checking it is no longer in the pending queue.
          const stillPendingUS = httpMock.match((r) =>
            r.url.includes('/movie/popular') && r.urlWithParams.includes('region=US')
          );
          expect(stillPendingUS.length).toBe(0);

          const deReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/popular') && r.urlWithParams.includes('region=DE')
          );
          deReq.flush({ results: [] as TMDbMovie[] });

          httpMock.verify();
        }
      )
    );

    it('loadBestRatedMovies re-requests with updated region param when selectedRegion$ changes',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          userService.selectedRegion$.next('GB');

          service.loadBestRatedMovies(1).subscribe();

          const firstReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/top_rated') && r.urlWithParams.includes('region=GB')
          );
          firstReq.flush({ results: [] as TMDbMovie[] });

          userService.selectedRegion$.next('JP');

          const secondReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/top_rated') && r.urlWithParams.includes('region=JP')
          );
          secondReq.flush({ results: [] as TMDbMovie[] });

          httpMock.verify();
        }
      )
    );

    it('loadBestRatedMovies cancels the in-flight request when selectedRegion$ switches before it completes',
      inject(
        [TMDbService, HttpTestingController, UserService],
        (service: TMDbService, httpMock: HttpTestingController, userService: UserService) => {
          userService.selectedRegion$.next('GB');

          service.loadBestRatedMovies(1).subscribe();

          const pendingReqs = httpMock.match((r) =>
            r.url.includes('/movie/top_rated') && r.urlWithParams.includes('region=GB')
          );
          expect(pendingReqs.length).toBe(1);

          userService.selectedRegion$.next('JP');

          const stillPendingGB = httpMock.match((r) =>
            r.url.includes('/movie/top_rated') && r.urlWithParams.includes('region=GB')
          );
          expect(stillPendingGB.length).toBe(0);

          const jpReq = httpMock.expectOne((r) =>
            r.url.includes('/movie/top_rated') && r.urlWithParams.includes('region=JP')
          );
          jpReq.flush({ results: [] as TMDbMovie[] });

          httpMock.verify();
        }
      )
    );
  });

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
