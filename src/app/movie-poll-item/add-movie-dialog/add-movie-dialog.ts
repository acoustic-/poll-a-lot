import { AsyncPipe, CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
} from "@angular/core";
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormControl,
} from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { BehaviorSubject, Subscription } from "rxjs";
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
} from "rxjs/operators";
import { PollItemService } from "../../../app/poll-item.service";
import { TMDbService } from "../../../app/tmdb.service";
import { Poll, PollItem } from "../../../model/poll";
import { Movie, TMDbMovie } from "../../../model/tmdb";
import { Observable } from "rxjs-compat";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { MovieDialog } from "../movie-dialog/movie-dialog";

@Component({
  selector: "add-movie-dialog",
  templateUrl: "add-movie-dialog.html",
  styleUrls: ["./add-movie-dialog.scss"],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    FormsModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    AsyncPipe,
    MatButtonModule,
    MatIconModule,
    MovieScoreComponent,
    LazyLoadImageModule,
  ],
})
export class AddMovieDialog implements OnDestroy {
  movieControl: UntypedFormControl;
  movieSub: Subscription;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);

  popularMovies$ = new BehaviorSubject<TMDbMovie[]>([]);
  bestRatedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);

  show: "popular" | "best-rated" = "popular";
  loadPopularMoviesCount = 1;
  loadBestRatedMoviesCount = 1;
  loadRatedMovies$: any;

  randomMoviesMax = 47;
  randomMovie = Math.floor(Math.random() * (this.randomMoviesMax - 1) + 1);

  constructor(
    public dialogRef: MatDialogRef<{ poll: Poll; pollItems: PollItem[] }>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    @Inject(MAT_DIALOG_DATA)
    public data: { poll: Poll; pollItems: PollItem[] }
  ) {
    this.movieControl = new UntypedFormControl();
    this.movieSub = this.movieControl.valueChanges
      .pipe(
        debounceTime(700),
        distinctUntilChanged(),
        switchMap((searchString) =>
          searchString?.length > 0
            ? this.tmdbService.searchMovies(searchString)
            : []
        )
      )
      .subscribe((results) => this.searchResults$.next(results));

    this.loadPopularMovies();
    this.loadBestRatedMovies();
  }

  async addMoviePollItem(movie: TMDbMovie) {
    console.log("add", movie);
    await this.pollItemService.addMoviePollItem(
      this.data.poll,
      this.data.pollItems,
      movie
    );
    this.searchResults$.next([]);
    this.dialogRef.close();
  }

  openAnotherMovie(movie: TMDbMovie) {
    const openedMovieDialog = this.dialog.open(MovieDialog, {
      height: "85%",
      width: "90%",
      maxWidth: "450px",

      data: {
        // movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: true,
      },
      autoFocus: false,
    });
    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.addMoviePollItem(movie);
        this.dialogRef.close();
      });
  }

  loadPopularMovies() {
    this.tmdbService
      .loadPopularMovies(this.loadPopularMoviesCount)
      .subscribe((movies) =>
        this.popularMovies$.next([...this.popularMovies$.getValue(), ...movies])
      );
    this.loadPopularMoviesCount += 1;
  }

  loadBestRatedMovies() {
    this.tmdbService
      .loadBestRatedMovies(this.loadBestRatedMoviesCount)
      .subscribe((movies) =>
        this.bestRatedMovies$.next([
          ...this.bestRatedMovies$.getValue(),
          ...movies,
        ])
      );
    this.loadBestRatedMoviesCount += 1;
  }

  trackById(index, item: Movie) {
    return item.id;
  }

  ngOnDestroy() {
    this.movieSub.unsubscribe();
  }
}
