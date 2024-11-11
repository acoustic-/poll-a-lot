import { Injectable } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { LocalCacheService } from "./local-cache.service";
import { map, switchMap } from "rxjs/operators";
import { LetterboxdItem, LogEntries } from "../model/letterboxd";

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
          ).pipe(map((response) => response.data as LetterboxdItem));
          return this.cache.observable(cacheKey, resp$, this.cacheExpiresIn);
        }
      })
    );
    return film$;
  }

  getLogEntries(memberId: string, query?: string): Observable<LogEntries> {
    const cacheKey = `letterboxd-logs-t-${memberId}-${query}`;

    const logs$ = this.cache.requestFromCache<LogEntries>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(
            httpsCallable(this.functions, "letterboxdLogs", {
              limitedUseAppCheckTokens: true,
            })({ memberId, query })
          ).pipe(map((response) => response.data as LogEntries));
          return this.cache.observable(cacheKey, resp$, 6 * 60 * 60);
        }
      })
    );
    return logs$;
  }
}
