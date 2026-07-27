import { ChangeDetectionStrategy, Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { filter, first, takeUntil } from "rxjs";
import { TMDbMovie } from "../../model/tmdb";
import { MovieSearchInputComponent } from "../movie-search-input/movie-search-input.component";
import { MovieDialogService } from "../movie-dialog.service";
import { UserService } from "../user.service";
import { PollItemService } from "../poll-item.service";
import { isDefined } from "../helpers";

export interface MovieSearchDialogData {
  // Poll the user was viewing when they opened this dialog (header.component.ts reads
  // it off the URL, since HeaderComponent sits outside <router-outlet>) — when set,
  // picking a movie adds it straight to that poll instead of the generic "new poll" flow.
  currentPollId?: string;
}

@Component({
    selector: "movie-search-dialog",
    templateUrl: "./movie-search-dialog.component.html",
    styleUrls: ["./movie-search-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatButtonModule, MatDialogModule, MovieSearchInputComponent],
})
export class MovieSearchDialogComponent {
  recentSearchCount = 10;

  constructor(
    private dialogRef: MatDialogRef<MovieSearchDialogComponent>,
    private movieDialog: MovieDialogService,
    private userService: UserService,
    private pollItemService: PollItemService,
    private router: Router,
    @Inject(MAT_DIALOG_DATA) private data: MovieSearchDialogData | null
  ) {}

  movieSelected(movie: TMDbMovie) {
    if (this.data?.currentPollId) {
      const pollId = this.data.currentPollId;
      const pollName = this.userService.recentPolls$
        .getValue()
        .find((poll) => poll.id === pollId)?.name;

      // Opens the movie dialog for the user to review before adding — its own
      // built-in "Add movie to X" button (data.addMovie) is what actually adds it,
      // same as every other add-to-poll entry point in the app. Selecting a search
      // result must not add the movie on its own.
      const openedMovieDialog = this.movieDialog.openMovie({
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: true,
        currentMovieOpen: true,
        parentStr: pollName || "this poll",
        parent: true,
      });

      openedMovieDialog.componentInstance.addMovie
        .pipe(first(), takeUntil(openedMovieDialog.afterClosed()), filter(isDefined))
        .subscribe(async (selected) => {
          (
            await this.pollItemService.addMoviePollItem(selected, pollId, undefined, false, true)
          ).subscribe();
        });

      this.dialogRef.close();
      return;
    }

    const openedMovieDialog = this.movieDialog.openMovie({
      movie,
      isVoteable: false,
      editable: false,
      movieId: movie.id,
      addMovie: this.userService.getUser()?.id !== undefined,
      currentMovieOpen: true,
      parentStr: "a new poll",
      landing: true,
      parent: true,
      useNavigation: true,
      showRecentPollAdder: true,
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(first(), takeUntil(openedMovieDialog.afterClosed()), filter(isDefined))
      .subscribe((selected) => {
        this.router.navigate(["/add-poll"], { queryParams: { movieId: selected.id } });
        openedMovieDialog.close();
      });

    this.dialogRef.close();
  }
}
