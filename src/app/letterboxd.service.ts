import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, from, of } from "rxjs";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { LocalCacheService } from "./local-cache.service";
import { catchError, map, switchMap } from "rxjs/operators";
import {
  LetterboxdItem,
  LetterboxdMemberCandidate,
  LetterboxdMemberProfileResult,
  LetterboxdSeenInfo,
  LogEntries,
} from "../model/letterboxd";

// GET /films accepts at most 100 filmId params per call.
const RELATIONSHIPS_CHUNK_SIZE = 100;

@Injectable()
export class LetterboxdService {
  private functions = inject(Functions);
  private cache = inject(LocalCacheService);

  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks

  // Created once in the constructor, inside its injection context, rather
  // than at each call site — httpsCallable() itself needs an active Angular
  // injection context (an AngularFire dev-mode warning otherwise), but
  // getFilm/getLogEntries run lazily from inside RxJS operators, well after
  // that context has closed.
  private letterboxdCallable: ReturnType<typeof httpsCallable>;
  private letterboxdLogsCallable: ReturnType<typeof httpsCallable>;
  private letterboxdSearchCallable: ReturnType<typeof httpsCallable>;
  private letterboxdRelationshipsCallable: ReturnType<typeof httpsCallable>;
  private letterboxdMemberProfileCallable: ReturnType<typeof httpsCallable>;

  constructor() {
    this.letterboxdCallable = httpsCallable(this.functions, "letterboxd", {
      limitedUseAppCheckTokens: true,
    });
    this.letterboxdLogsCallable = httpsCallable(
      this.functions,
      "letterboxdLogs",
      { limitedUseAppCheckTokens: true }
    );
    this.letterboxdSearchCallable = httpsCallable(
      this.functions,
      "letterboxdSearch",
      { limitedUseAppCheckTokens: true }
    );
    this.letterboxdRelationshipsCallable = httpsCallable(
      this.functions,
      "letterboxdRelationships",
      { limitedUseAppCheckTokens: true }
    );
    this.letterboxdMemberProfileCallable = httpsCallable(
      this.functions,
      "letterboxdMemberProfile",
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

  // Private, viewer-only "already seen" lookup — never written to Firestore,
  // never shown to anyone but the viewer. Absence from the returned map means
  // "not marked watched", not "unknown".
  //
  // Cached per-film rather than per-request-batch: a movie-dialog lookup for
  // one film, a poll's whole roster, and a search-results page all ask about
  // overlapping films, and a whole-batch cache key doesn't let those share
  // hits. This checks each requested film's own cache entry first, fetches
  // only the ones actually missing (one call, chunked to the API's 100-id
  // cap), and caches every fetched film — including a negative (null) entry
  // for "checked, not watched" — individually, so any future request
  // touching that same film, from anywhere, gets a cache hit.
  getRelationships(lid: string, tmdbIds: number[]): Observable<Record<number, LetterboxdSeenInfo>> {
    if (tmdbIds.length === 0) {
      return of({});
    }

    const uniqueIds = [...new Set(tmdbIds)];

    const rel$ = forkJoin(
      uniqueIds.map((id) =>
        this.cache.requestFromCache<LetterboxdSeenInfo | null>(this.relationshipCacheKey(lid, id)).pipe(
          map((cached) => ({ id, hit: !!cached, value: cached?.value ?? null }))
        )
      )
    ).pipe(
      switchMap((entries) => {
        const result: Record<number, LetterboxdSeenInfo> = {};
        const missingIds: number[] = [];
        entries.forEach(({ id, hit, value }) => {
          if (!hit) {
            missingIds.push(id);
          } else if (value) {
            result[id] = value;
          }
        });

        if (missingIds.length === 0) {
          return of(result);
        }

        const chunks: number[][] = [];
        for (let i = 0; i < missingIds.length; i += RELATIONSHIPS_CHUNK_SIZE) {
          chunks.push(missingIds.slice(i, i + RELATIONSHIPS_CHUNK_SIZE));
        }

        return forkJoin(
          chunks.map((chunk) =>
            from(this.letterboxdRelationshipsCallable({ lid, tmdbIds: chunk })).pipe(
              map((response) => response.data as Record<number, LetterboxdSeenInfo>)
            )
          )
        ).pipe(
          switchMap((responses) => {
            const fresh: Record<number, LetterboxdSeenInfo> = Object.assign({}, ...responses);
            const writes = missingIds.map((id) =>
              this.cache.value(this.relationshipCacheKey(lid, id), fresh[id] ?? null, 6 * 60 * 60)
            );
            return forkJoin(writes).pipe(map(() => ({ ...result, ...fresh })));
          })
        );
      }),
      // Same SSR/App-Check fallback as getFilm/getLogEntries above.
      catchError((error) => {
        console.error("Failed to load Letterboxd relationships:", lid, error);
        return of({} as Record<number, LetterboxdSeenInfo>);
      })
    );
    return rel$;
  }

  // Profile panel data source (favourites, stats, ratings histogram).
  getMemberProfile(lid: string): Observable<LetterboxdMemberProfileResult> {
    const cacheKey = `letterboxd-member-profile-${lid}`;

    const profile$ = this.cache.requestFromCache<LetterboxdMemberProfileResult>(cacheKey).pipe(
      switchMap((cached) => {
        if (cached) {
          return of(cached.value);
        } else {
          const resp$ = from(this.letterboxdMemberProfileCallable({ lid })).pipe(
            map((response) => response.data as LetterboxdMemberProfileResult)
          );
          return this.cache.observable(cacheKey, resp$, 6 * 60 * 60);
        }
      }),
      // Same SSR/App-Check fallback as getFilm/getLogEntries above.
      catchError((error) => {
        console.error("Failed to load Letterboxd member profile:", lid, error);
        return of({ optedOut: false } as LetterboxdMemberProfileResult);
      })
    );
    return profile$;
  }

  // Deliberately uncached — each call reflects live keystrokes in the
  // account-linking picker, so stale candidates would be actively misleading.
  searchMembers(input: string): Observable<LetterboxdMemberCandidate[]> {
    return from(this.letterboxdSearchCallable({ input })).pipe(
      map((response) => response.data as LetterboxdMemberCandidate[]),
      catchError((error) => {
        console.error("Failed to search Letterboxd members:", input, error);
        return of([] as LetterboxdMemberCandidate[]);
      })
    );
  }

  private relationshipCacheKey(lid: string, tmdbId: number): string {
    return `letterboxd-rel-${lid}-${tmdbId}`;
  }
}
