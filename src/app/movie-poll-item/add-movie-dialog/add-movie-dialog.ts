import { AsyncPipe, CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  ElementRef,
  ViewChild,
  OnInit,
  AfterViewInit,
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
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { BehaviorSubject, Subscription } from "rxjs";
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
  map,
} from "rxjs/operators";
import { PollItemService } from "../..//poll-item.service";
import { TMDbService } from "../../tmdb.service";
import { Poll, PollItem } from "../../../model/poll";
import { Movie, TMDbMovie } from "../../../model/tmdb";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { MovieDialog } from "../movie-dialog/movie-dialog";
import { WatchProviderSelectComponent } from "../../watch-providers/watch-providers.component";

type SelectionType = "recommended" | "popular" | "best-rated";

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
    MatIconModule,
    MatFormFieldModule,
    WatchProviderSelectComponent,
    MatExpansionModule,
  ],
})
export class AddMovieDialog implements OnInit, AfterViewInit, OnDestroy {
  movieControl: UntypedFormControl;
  movieSub: Subscription;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);

  popularMovies$ = new BehaviorSubject<TMDbMovie[]>([]);
  bestRatedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);
  recommendedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);

  show: SelectionType = "recommended";
  loadPopularMoviesCount = 1;
  loadBestRatedMoviesCount = 1;
  loadRecommendedMoviesCount = 1;
  loadRatedMovies$: any;

  randomMoviesMax = 47;
  randomMovie = Math.floor(Math.random() * (this.randomMoviesMax - 1) + 1);

  backgroundLoaded$ = new BehaviorSubject<boolean>(false);

  watchProvidersChange = false;

  get pollMovieIds(): number[] {
    return this.data.pollItems.map((p) => p.movieId).filter((x) => !!x);
  }

  @ViewChild("onTop") topElement: ElementRef;

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
        // TODO: Consider this
        // map((movies) =>
        //   movies.filter((movie) => !this.pollMovieIds.includes(movie.id))
        // )
      )
      .subscribe((results) => this.searchResults$.next(results));

    // Initialize the default selection
    this.setSelection("recommended");
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

  ngOnInit() {}

  ngAfterViewInit() {
    this.topElement.nativeElement.scrollIntoView();
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
      .pipe(
        map((movies) =>
          movies.filter((movie) => !this.pollMovieIds.includes(movie.id))
        )
      )
      .subscribe((movies) =>
        this.popularMovies$.next([...this.popularMovies$.getValue(), ...movies])
      );
    this.loadPopularMoviesCount += 1;
  }

  loadBestRatedMovies() {
    this.tmdbService
      .loadBestRatedMovies(this.loadBestRatedMoviesCount)
      .pipe(
        map((movies) =>
          movies.filter((movie) => !this.pollMovieIds.includes(movie.id))
        )
      )
      .subscribe((movies) =>
        this.bestRatedMovies$.next([
          ...this.bestRatedMovies$.getValue(),
          ...movies,
        ])
      );
    this.loadBestRatedMoviesCount += 1;
  }

  loadRecommendedMovies() {
    let mostCommonGenres = this.getCommonGenres(
      this.data.pollItems.reduce(
        (cum, i) => [...cum, ...(i.movieIndex?.genres || [])],
        []
      )
    );
    // To make it more interesting: Drama is the most common genre tag,
    // remove it if there are other genre options (drama = 18)
    if (mostCommonGenres.includes(18) && mostCommonGenres.length > 1) {
      mostCommonGenres = mostCommonGenres.filter((genre) => genre !== 18);
    }

    // let mostCommonKeyWords = this.getCommonKeywords(
    //   this.data.pollItems.reduce(
    //     (cum, i) => [...cum, ...(i.movieIndex?.keywords || [])],
    //     []
    //   ),
    //   1,
    //   100
    // );

    const years: number[] = this.data.pollItems.reduce(
      (cum, i) => [
        ...cum,
        Number(new Date(i.movieIndex?.release).getFullYear()),
      ],
      []
    );

    this.tmdbService
      .loadRecommendedMovies(
        this.loadRecommendedMoviesCount,
        mostCommonGenres,
        years
        // mostCommonKeyWords
      )
      .pipe(
        map((movies) =>
          movies.filter((movie) => !this.pollMovieIds.includes(movie.id))
        )
      )
      .subscribe((movies) =>
        this.recommendedMovies$.next([
          ...this.recommendedMovies$.getValue(),
          ...movies,
        ])
      );
    this.loadRecommendedMoviesCount += 1;
  }

  setSelection(input: SelectionType) {
    this.show = input;

    if (
      this.recommendedMovies$.getValue().length === 0 &&
      input === "recommended"
    ) {
      this.loadRecommendedMovies();
    }
    if (
      this.bestRatedMovies$.getValue().length === 0 &&
      input === "best-rated"
    ) {
      this.loadBestRatedMovies();
    }
    if (this.popularMovies$.getValue().length === 0 && input === "popular") {
      this.loadPopularMovies();
    }
  }

  updateRecommendedSearch() {
    if (this.watchProvidersChange) {
      this.loadRecommendedMoviesCount = 1;
      this.recommendedMovies$.next([]);
      this.watchProvidersChange = false;
      this.loadRecommendedMovies();
    }
  }

  close() {
    this.dialogRef.close();
  }

  trackById(index, item: Movie) {
    return item.id;
  }

  getCommonGenres(genres: number[], count = 3): number[] {
    const frequency: { genre: Number; count: number }[] = [];

    genres.forEach((item) => {
      if (frequency.some((f) => f.genre === item)) {
        frequency.find((f) => f.genre === item).count += 1;
      } else {
        frequency.push({ genre: item, count: 1 });
      }
    });

    const sortedArray = frequency.sort((a, b) =>
      a.count < b.count ? 1 : a.count > b.count ? -1 : 0
    );

    const selectedGenres = [];
    for (let i = 0; i < sortedArray.length; ++i) {
      const currentItem = sortedArray[i];
      if (i === 0) {
        selectedGenres.push(currentItem.genre);
        continue;
      }
      const previousItem = sortedArray[i - 1];
      if (previousItem.count / currentItem.count < 1.5) {
        selectedGenres.push(currentItem.genre);
        continue;
      } else {
        break;
      }
    }

    let mostCommonGenres = selectedGenres
      .slice(0, count)
      .map((item) => parseInt(item));

    return mostCommonGenres;
  }

  // getCommonKeywords(keywords: number[], min = 2, count = 5): number[] {
  //   const frequency: { keyword: number; count: number }[] = [];

  //   keywords.forEach((item) => {
  //     if (frequency.some((f) => f.keyword === item)) {
  //       frequency.find((f) => f.keyword === item).count += 1;
  //     } else {
  //       frequency.push({ keyword: item, count: 1 });
  //     }
  //   });

  //   const sortedArray = frequency
  //     .sort((a, b) => (a.count < b.count ? 1 : a.count > b.count ? -1 : 0))
  //     .filter((keyword) => keyword.count >= min);

  //   let mostCommonKeywords = sortedArray
  //     .map((keyword) => keyword.keyword)
  //     .slice(0, count)
  //     .map((item) => item);

  //   return mostCommonKeywords;
  // }

  ngOnDestroy() {
    this.movieSub.unsubscribe();
  }
}
