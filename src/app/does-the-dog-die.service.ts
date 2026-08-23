import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { LocalCacheService } from './local-cache.service';
import { from, map, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DoesTheDogDieService {
  private functions = inject(Functions);
  private cache = inject(LocalCacheService);

  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks

  // Created once in the constructor, inside its injection context, rather
  // than at the call site — httpsCallable() itself needs an active Angular
  // injection context (an AngularFire dev-mode warning otherwise), but
  // loadDoesTheDogDieInfo runs lazily from inside an RxJS operator, well
  // after that context has closed.
  private doesTheDogDieCallable: ReturnType<typeof httpsCallable>;

  constructor() {
    this.doesTheDogDieCallable = httpsCallable(this.functions, "doesTheDogDie", {
      limitedUseAppCheckTokens: true,
    });
  }

  loadDoesTheDogDieInfo(imdbId: string): Observable<any> {
    const cacheKey = `does-the-dog-die-${imdbId}`;

    const response$ = this.cache.requestFromCache<any>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(this.doesTheDogDieCallable({ imdbId })).pipe(
            map((response) => response.data)
          );
          return this.cache.observable(cacheKey, resp$, this.cacheExpiresIn);
        }
      })
    );
    return response$;
  }
}
