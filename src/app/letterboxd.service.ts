import { Injectable } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { LocalCacheService } from "./local-cache.service";
import { catchError, map, switchMap } from "rxjs/operators";
import { LetterboxdItem, LogEntries } from "../model/letterboxd";

@Injectable()
export class LetterboxdService {
  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks

  // Created once in the constructor, inside its injection context, rather
  // than at each call site — httpsCallable() itself needs an active Angular
  // injection context (an AngularFire dev-mode warning otherwise), but
  // getFilm/getLogEntries run lazily from inside RxJS operators, well after
  // that context has closed.
  private letterboxdCallable: ReturnType<typeof httpsCallable>;
  private letterboxdLogsCallable: ReturnType<typeof httpsCallable>;

  constructor(private functions: Functions, private cache: LocalCacheService) {
    this.letterboxdCallable = httpsCallable(this.functions, "letterboxd", {
      limitedUseAppCheckTokens: true,
    });
    this.letterboxdLogsCallable = httpsCallable(
      this.functions,
      "letterboxdLogs",
      { limitedUseAppCheckTokens: true }
    );
  }

  getFilm(tmdbId: number): Observable<LetterboxdItem> {
    const cacheKey = `letterboxd-film-id-${tmdbId}`;

    const film$ = this.cache.requestFromCache<LetterboxdItem>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(this.letterboxdCallable({ tmdbId })).pipe(
            map((response) => response.data as LetterboxdItem)
          );
          return this.cache.observable(cacheKey, resp$, this.cacheExpiresIn);
        }
      }),
      // Letterboxd requires an App Check token, which isn't available
      // during SSR prerendering (see app.module.ts) — fall back rather
      // than letting that expected failure surface as an uncaught error.
      catchError((error) => {
        console.error("Failed to load Letterboxd film data:", tmdbId, error);
        return of(undefined as LetterboxdItem | undefined);
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
            this.letterboxdLogsCallable({ memberId, query })
          ).pipe(map((response) => response.data as LogEntries));
          return this.cache.observable(cacheKey, resp$, 6 * 60 * 60);
        }
      }),
      // Same SSR/App-Check fallback as getFilm above.
      catchError((error) => {
        console.error(
          "Failed to load Letterboxd log entries:",
          memberId,
          error
        );
        return of({ next: undefined, items: [], itemCount: 0 } as LogEntries);
      })
    );
    return logs$;
  }
}
