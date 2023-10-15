import { AsyncPipe, CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  recommendedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);

  show: "recommended" | "popular" | "best-rated" = "recommended";
  loadPopularMoviesCount = 1;
  loadBestRatedMoviesCount = 1;
  loadRecommendedMoviesCount = 1;
  loadRatedMovies$: any;

  randomMoviesMax = 47;
  randomMovie = Math.floor(Math.random() * (this.randomMoviesMax - 1) + 1);

  backgroundLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
    public dialogRef: MatDialogRef<{ poll: Poll; pollItems: PollItem[] }>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private cd: ChangeDetectorRef,
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
    this.loadRecommendedMovies();
  }

  async addMoviePollItem(movie: TMDbMovie, confirm = false) {
    this.searchResults$.next([]);
    this.dialogRef.close();
    await this.pollItemService.addMoviePollItem(
      this.data.poll,
      this.data.pollItems,
      movie,
      false,
      confirm
    );
  }

  onStateChangeLoad(event) {
    if (event.reason === "finally") {
      setTimeout(() => {
        this.backgroundLoaded$.next(true);
        this.cd.detectChanges();
      });
    }
  }

  openAnotherMovie(movie: TMDbMovie) {
    const openedMovieDialog = this.dialog.open(MovieDialog, {
      height: "85%",
      width: "90%",
      maxWidth: "450px",

      data: {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: true,
        currentMovieOpen: false,
      },
      autoFocus: false,
    });
    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe(async (movie) => {
        await this.addMoviePollItem(movie);
        this.searchResults$.next([]);
        this.dialog.closeAll();
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

  loadRecommendedMovies() {
    const genres: number[] = this.data.pollItems.reduce(
      (cum, i) => [...cum, ...i.movieIndex.genres],
      []
    );

    const n = 3;

    const frequency = {};

    genres.forEach((item) => {
      if (frequency[item]) {
        frequency[item]++;
      } else {
        frequency[item] = 1;
      }
    });

    const sortedItems = Object.keys(frequency).sort(
      (a, b) => frequency[b] - frequency[a]
    );

    const mostCommonGenres = sortedItems
      .slice(0, n)
      .map((item) => parseInt(item));

    const years: number[] = this.data.pollItems.reduce(
      (cum, i) => [
        ...cum,
        Number(new Date(i.movieIndex.release).getFullYear()),
      ],
      []
    );

    this.tmdbService
      .loadRecommendedMovies(
        this.loadRecommendedMoviesCount,
        mostCommonGenres,
        years
      )
      .subscribe((movies) =>
        this.recommendedMovies$.next([
          ...this.recommendedMovies$.getValue(),
          ...movies,
        ])
      );
    this.loadRecommendedMoviesCount += 1;
  }

  close() {
    this.dialogRef.close();
  }

  trackById(index, item: Movie) {
    return item.id;
  }

  ngOnDestroy() {
    this.movieSub.unsubscribe();
  }
}
