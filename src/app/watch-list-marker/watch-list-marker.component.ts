import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, AsyncPipe } from "@angular/common";
import { UserService } from "../user.service";
import { BehaviorSubject, Observable } from "rxjs";
import { filter, first, map, switchMap, tap } from "rxjs/operators";
import { TMDbService } from "../tmdb.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Movie } from "../../model/tmdb";
import { MatIconModule } from "@angular/material/icon";
import { isDefined } from "../helpers";

@Component({
    selector: "watch-list-marker",
    templateUrl: "./watch-list-marker.component.html",
    styleUrls: ["./watch-list-marker.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, AsyncPipe, MatIconModule]
})
export class WatchListMarker {
  @Input() set movieId(input: number) {
    this.movieId$.next(input);
  }
  @Input() size: 'xxs' | 'xs' | 's' | 'l' | 'm' | 'grid' = 'm';

  movieId$: BehaviorSubject<number | undefined> = new BehaviorSubject<
    number | undefined
  >(undefined);
  watchlisted$: Observable<boolean>;
  sizeClass$ = new BehaviorSubject<string>("");
  private watchlist: any;

  constructor(
    private userService: UserService,
    private tmdbService: TMDbService,
    private snackBar: MatSnackBar
  ) {
    this.watchlisted$ = this.movieId$.asObservable().pipe(
      filter(isDefined),
      switchMap((movieId: number) =>
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

    this.tmdbService.loadCombinedMovie(movieId).subscribe(async (movie) => {
      const movieStr = `${`${movie.title} (${new Date(
        movie.releaseDate
      ).getFullYear()})`}`;

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
          .pipe(first())
          .subscribe(() => this.toggleWatchlistItem(movie));
      } else {
        await this.toggleWatchlistItem(movie).then(() => {
          this.snackBar.open(
            !watchlisted
              ? `Added movie ${movieStr} to your watchlist`
              : `Removed movie ${movieStr} from your watchlist`,
            undefined,
            { duration: 5000 }
          );
        });
      }
    });
  }

  private async toggleWatchlistItem(movie: Movie) {
    await this.userService.toggleWatchlistMovie(
      this.tmdbService.movie2WatchlistItem(movie),
      this.watchlist
    );
  }
}
