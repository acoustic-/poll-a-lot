import { Injectable } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { LetterboxdItem } from "../model/tmdb";
import { LocalCacheService } from "./local-cache.service";
import { switchMap } from "rxjs/operators";

@Injectable()
export class LetterboxdService {
  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks

  constructor(private functions: Functions, private cache: LocalCacheService) {}

  getFilm(tmdbId: number): Observable<LetterboxdItem> {
    const cacheKey = `letterboxd-film-id-${tmdbId}`;

    const film$ = this.cache.requestFromCache<LetterboxdItem>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(
            httpsCallable(this.functions, "letterboxd", {
              limitedUseAppCheckTokens: true,
            })({ tmdbId })
          ).map((response) => response.data as LetterboxdItem);
          return this.cache.observable(cacheKey, resp$, this.cacheExpiresIn);
        }
      })
    );
    return film$;
  }
}
