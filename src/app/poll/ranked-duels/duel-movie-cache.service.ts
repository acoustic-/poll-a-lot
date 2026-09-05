import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, finalize, shareReplay, tap } from "rxjs/operators";
import { Movie } from "../../../model/tmdb";
import { TMDbService } from "../../tmdb.service";

/**
 * Process-lifetime cache of fully-resolved `Movie` objects for the duel view.
 *
 * `DuelViewComponent` is torn down and rebuilt every time the dialog opens, so
 * its own per-instance map meant each run re-ran `loadCombinedMovie` from an
 * empty state — the band would paint snapshot-only, then pop in genres / cast /
 * external ratings again. This service is `providedIn: "root"`, so a film
 * viewed in one run is still complete when it comes back in the next.
 *
 * `loadCombinedMovie`'s own HTTP is already `LocalCacheService`-backed; what
 * this adds is holding the *assembled* result in memory so there's no pipeline
 * re-run (and no progressive re-paint) on a second look.
 */
@Injectable({ providedIn: "root" })
export class DuelMovieCacheService {
  private readonly tmdb = inject(TMDbService);
  private readonly resolved = new Map<number, Movie>();
  private readonly pending = new Map<number, Observable<Movie | undefined>>();

  /** The resolved movie if it's already assembled, else `undefined`. */
  get(movieId: number): Movie | undefined {
    return this.resolved.get(movieId);
  }

  /**
   * Start (or re-use) the fetch for `movieId`. The returned observable replays
   * its latest value to every later subscriber, so once a run has assembled the
   * movie, subsequent runs get it in one synchronous emission — no re-paint.
   * A fetch that never assembles anything is dropped so a later run can retry.
   */
  ensure(movieId: number): Observable<Movie | undefined> {
    if (this.resolved.has(movieId)) return of(this.resolved.get(movieId));

    let stream = this.pending.get(movieId);
    if (!stream) {
      stream = this.tmdb.loadCombinedMovie(movieId, false).pipe(
        catchError(() => of<Movie | undefined>(undefined)),
        tap((movie) => {
          if (movie) this.resolved.set(movieId, movie);
        }),
        finalize(() => {
          if (!this.resolved.has(movieId)) this.pending.delete(movieId);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.pending.set(movieId, stream);
    }
    return stream;
  }
}
