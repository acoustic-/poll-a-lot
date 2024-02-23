import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, AsyncPipe } from "@angular/common";
import { UserService } from "../user.service";
import { BehaviorSubject, Observable } from "rxjs";
import { filter, map, switchMap, tap } from "rxjs/operators";
import { TMDbService } from "../tmdb.service";
import { MatSnackBar } from "@angular/material/snack-bar";

@Component({
  selector: "watch-list-marker",
  templateUrl: "./watch-list-marker.component.html",
  styleUrls: ["./watch-list-marker.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, AsyncPipe],
  standalone: true,
})
export class WatchListMarker {
  @Input() set movieId(input: number) {
    this.movieId$.next(input);
  }

  movieId$: BehaviorSubject<number | undefined> = new BehaviorSubject<
    number | undefined
  >(undefined);
  watchlisted$: Observable<boolean>;
  private watchlist: any;

  constructor(
    private userService: UserService,
    private tmdbService: TMDbService,
    private snackBar: MatSnackBar
  ) {
    this.watchlisted$ = this.movieId$.asObservable().pipe(
      switchMap((movieId) =>
        this.userService.getUserData$().pipe(
          filter((d) => !!d),
          tap((data) => (this.watchlist = data.watchlist)),
          map((data) => data.watchlist.map((m) => m.moviePollItemData.id)),
          map((watchlistIds) => watchlistIds.includes(movieId))
        )
      )
    );
  }

  click(movieId: number, watchlisted: boolean, confirm = false) {
    if (
      !this.userService.getUserOrOpenLogin(
        () => this.click(movieId, watchlisted),
        true
      )
    ) {
      return;
    }

    this.tmdbService.loadCombinedMovie(movieId).subscribe((movie) => {
      const movieStr = `${`${movie.title} (${new Date(
        movie.releaseDate
      ).getFullYear()})`}`;

      const toggleWatchlistItem = () =>
        this.userService.toggleWatchlistMovie(
          this.tmdbService.movie2WatchlistItem(movie),
          this.watchlist
        );

      if (confirm) {
        const ref = this.snackBar.open(
          !watchlisted
            ? `Add movie ${movieStr} to your watchlist?`
            : `Remove movie ${movieStr} from your watchlist?`,
          !watchlisted ? `Add` : `Remove`,
          { duration: 5000 }
        );
        ref
          .onAction()
          .first()
          .subscribe(() => toggleWatchlistItem());
      } else {
        toggleWatchlistItem();
        this.snackBar.open(
          !watchlisted
            ? `Added movie ${movieStr} to your watchlist`
            : `Removed movie ${movieStr} from your watchlist`,
          undefined,
          { duration: 5000 }
        );
      }
    });
  }
}
