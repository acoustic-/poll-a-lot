import { Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { LocalCacheService } from './local-cache.service';
import { from, map, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DoesTheDogDieService {
  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks

  constructor(
    private functions: Functions,
    private cache: LocalCacheService
  ) {

  }
  
  loadDoesTheDogDieInfo(imdbId: string): Observable<any> {
    const cacheKey = `does-the-dog-die-${imdbId}`;

    const response$ = this.cache.requestFromCache<any>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(
            httpsCallable(this.functions, "doesTheDogDie", {
              limitedUseAppCheckTokens: true,
            })({ imdbId })
          ).pipe(map((response) => response.data));
          return this.cache.observable(cacheKey, resp$, this.cacheExpiresIn);
        }
      })
    );
    return response$;
  }
}
