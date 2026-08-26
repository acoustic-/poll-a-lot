import { Component, ChangeDetectionStrategy, inject } from "@angular/core";

import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { Observable, BehaviorSubject } from "rxjs";
import {
  switchMap,
  map,
  takeUntil,
  first,
  distinctUntilChanged,
} from "rxjs/operators";
import { WatchlistItem } from "../../model/tmdb";
import { WatchlistViewMode } from "../../model/watch-list";
import { AddMovieDialog } from "../movie-poll-item/add-movie-dialog/add-movie-dialog";
import { TMDbService } from "../tmdb.service";
import { defaultDialogHeight, defaultDialogOptions } from "../common";
import { MovieDialogService } from "../movie-dialog.service";
import { MatCard } from "@angular/material/card";
import { ButtonGradientComponent } from "../shared/button-gradient/button-gradient.component";
import { MatIcon } from "@angular/material/icon";
import { NgClass, NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { WatchListItemComponent } from "./watch-list-item/watch-list-item.component";
import { PosterComponent } from "../poster/poster.component";

@Component({
    selector: "watch-list",
    templateUrl: "./watch-list.component.html",
    styleUrls: ["./watch-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatCard, ButtonGradientComponent, MatIcon, NgClass, WatchListItemComponent, NgTemplateOutlet, PosterComponent, AsyncPipe]
})
export class WatchListComponent {
  private userService = inject(UserService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private tmdbService = inject(TMDbService);
  private movieDialog = inject(MovieDialogService);

  watchlist$: Observable<WatchlistItem[]>;
  viewMode$ = new BehaviorSubject<WatchlistViewMode>("rows");
  posterLoaded = false;

  constructor() {
    this.watchlist$ = this.userService.getWatchlistMovies$();
  }

  trackById(index, item: WatchlistItem) {
    return item.moviePollItemData.id;
  }

  private toggleWatchlistItem(
    watchlistItem: WatchlistItem,
    watchlist: WatchlistItem[],
    allowToggle = true
  ) {
    this.userService.toggleWatchlistMovie(
      watchlistItem,
      watchlist,
      allowToggle
    );
  }

  openAdd(watchlist: WatchlistItem[]) {
    const ref = this.dialog.open(AddMovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        movieIds: watchlist.map((w) => w.moviePollItemData.id),
        parentStr: "watchlist",
        watchlistItems: watchlist,
      },
    });
    ref.componentInstance.addMovie
      .pipe(
        takeUntil(ref.afterClosed()),
        distinctUntilChanged((a, b) => a.id === b.id),
        switchMap((movie) =>
          this.tmdbService
            .loadCombinedMovie(movie.id)
            .pipe(map((m) => this.tmdbService.movie2WatchlistItem(m)))
        )
      )
      .subscribe((watchlistItem) => {
        if (watchlistItem) {
          if (
            !this.includesMovie(watchlistItem.moviePollItemData.id, watchlist)
          ) {
            this.dialog.closeAll();
          } else {
            this.snackBar.open(
              "You already have this on your watchlist. Add something else!",
              undefined,
              { duration: 5000 }
            );
          }
          this.toggleWatchlistItem(watchlistItem, watchlist, false);
        }
      });
  }

  showMovie(movieId: number, watchlist: WatchlistItem[]) {
    const openedMovieDialog = this.movieDialog.openMovie({
      isVoteable: false,
      editable: false,
      movieId,
      addMovie: false,
      currentMovieOpen: true,
      parentStr: "watchlist",
      showRecentPollAdder: true,
      parent: true,
      filterMovies: watchlist.map((i) => i.moviePollItemData.id),
    });
    openedMovieDialog.componentInstance.addMovie
      .pipe(first(), takeUntil(openedMovieDialog.afterClosed()))
      .pipe(
        switchMap((movie) =>
          this.tmdbService
            .loadCombinedMovie(movie.id)
            .pipe(map((m) => this.tmdbService.movie2WatchlistItem(m)))
        )
      )
      .subscribe((watchlistItem) => {
        if (this.includesMovie(movieId, watchlist)) {
          this.dialog.closeAll();
        } else {
          this.snackBar.open(
            "You already have this on your watchlist. Add something else!",
            undefined,
            { duration: 5000 }
          );
        }
        this.toggleWatchlistItem(watchlistItem, watchlist);
      });
  }

  removeItem(watchlistItem: WatchlistItem, watchlist: WatchlistItem[]) {
    const movieStr = `${`${watchlistItem.moviePollItemData.title} (${new Date(
      watchlistItem.moviePollItemData.releaseDate
    ).getFullYear()})`}`;
    const ref = this.snackBar.open(
      `Remove movie ${movieStr} from your watchlist?`,
      `Remove`,
      { duration: 5000 }
    );
    ref
      .onAction()
      .pipe(first())
      .subscribe(() => this.toggleWatchlistItem(watchlistItem, watchlist));
  }

  private includesMovie(movieId: number, watchlist: WatchlistItem[]): boolean {
    return watchlist.some((i) => i.moviePollItemData.id === movieId);
  }
}
