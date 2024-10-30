import { AsyncPipe, CommonModule, JsonPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  ElementRef,
  ViewChild,
  OnInit,
  Output,
  AfterViewInit,
  EventEmitter,
} from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
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
import { BehaviorSubject, NEVER, Observable } from "rxjs";
import { takeUntil, map, filter } from "rxjs/operators";
import { PollItemService } from "../..//poll-item.service";
import { TMDbService } from "../../tmdb.service";
import { Poll, PollItem } from "../../../model/poll";
import {
  Movie,
  MovieIndex,
  TMDbMovie,
  WatchlistItem,
} from "../../../model/tmdb";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { MovieDialog } from "../movie-dialog/movie-dialog";
import { WatchProviderSelectComponent } from "../../watch-providers/watch-providers.component";
import { ScreenHeightPipe } from "../../screen-height.pipe";
import { UserService } from "../../user.service";
import { defaultDialogHeight, defaultDialogOptions } from "../../common";
import { PosterComponent } from "../../poster/poster.component";
import { MatAutocompleteOptionsScrollDirective } from "../../mat-auto-complete-scroll.directive";
import { MovieSearchResultComponent } from "../../movie-search-result/movie-search-result.component";
import { MovieSearchInputComponent } from "../../movie-search-input/movie-search-input.component";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { PollDescriptionData, PollDescriptionSheet } from "../../poll/poll-description-dialog/poll-description-dialog";
import { GeminiService } from "../../gemini.service";
import { SuggestMovieButtonComponent } from "../../suggest-movie-button/suggest-movie-button.component";

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
    ScreenHeightPipe,
    JsonPipe,
    PosterComponent,
    MatAutocompleteOptionsScrollDirective,
    MovieSearchResultComponent,
    MovieSearchInputComponent,
    MatBottomSheetModule,
    SuggestMovieButtonComponent
  ],
})
export class AddMovieDialog implements OnInit, AfterViewInit, OnDestroy {
  popularMovies$ = new BehaviorSubject<TMDbMovie[]>([]);
  bestRatedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);
  recommendedMovies$ = new BehaviorSubject<TMDbMovie[]>([]);

  show: SelectionType = "recommended";
  loadPopularMoviesCount = 1;
  loadBestRatedMoviesCount = 1;
  loadRecommendedMoviesCount = 1;
  loadRatedMovies$: any;

  subs = NEVER.subscribe();

  randomMoviesMax = 47;
  randomMovie = Math.floor(Math.random() * (this.randomMoviesMax - 1) + 1);

  backgroundLoaded$ = new BehaviorSubject<boolean>(false);

  watchProvidersChange = false;
  filteredWatchProviders: number[] | undefined = undefined;

  watchlistItems$: Observable<WatchlistItem[]>;
  // Fix items per row with the watchlist items on smaller screens
  watchlistRowCount: Readonly<number> = Math.min(
    Math.floor((window.innerWidth - 64) / (65 + 2 * 5)),
    5
  );
  showWatchlistItemsCount = this.watchlistRowCount;

  loadedWithWatchProviders =
    this.userService.selectedWatchProviders$.getValue();

  get pollMovieIds(): number[] | undefined {
    return this.data.pollData?.pollItems
      .map((p) => p.movieId)
      .filter((x) => !!x);
  }

  movieSuggestion: string | undefined;
  pollMovies: string[] = [];

  @ViewChild("onTop") topElement: ElementRef;
  @ViewChild("movieInput") movieInput: ElementRef;
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  constructor(
    public dialogRef: MatDialogRef<{
      pollData?: { poll: Poll; pollItems: PollItem[] };
      movieIds?: number[];
      parentStr?: string;
      watchlistItems?: WatchlistItem[];
    }>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private cd: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      pollData?: { poll: Poll; pollItems: PollItem[] };
      movieIds?: number[];
      parentStr?: string;
      watchlistItems?: WatchlistItem[];
    },
    private userService: UserService,
    private bottomSheet: MatBottomSheet,
    private geminiService: GeminiService
  ) {}

  addMoviePollItem(movie: TMDbMovie, confirm = false) {
    const openedMovieDialog = this.dialog.open(MovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: true,
        currentMovieOpen: false,
        filterMovies: this.data.movieIds,
        parentStr: this.data.parentStr,
        parent: true,
      },
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.add(movie, true);
      });
  }

  ngOnInit() {
    // Initialize the default selection
    this.setSelection("recommended");
    this.watchlistItems$ = this.userService
      .getWatchlistMovies$()
      .pipe(
        map((watchlistItems) =>
          watchlistItems.filter(
            (watchlistItem) =>
              !this.data.movieIds.includes(watchlistItem.moviePollItemData.id)
          )
        )
      );

      this.pollMovies = this.data?.pollData?.pollItems?.map(p => p.name) || [];
  }

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
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: true,
        currentMovieOpen: true,
        parentStr: this.data.parentStr,
        filterMovies: this.pollMovieIds || this.data.movieIds,
      },
    });
    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.add(movie, true);
        openedMovieDialog.close();
      });
  }

  loadPopularMovies() {
    this.tmdbService
      .loadPopularMovies(this.loadPopularMoviesCount)
      .pipe(
        map((movies) =>
          movies.filter(
            (movie) =>
              !(this.pollMovieIds || this.data.movieIds).includes(movie.id)
          )
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
          movies.filter(
            (movie) =>
              !(this.pollMovieIds || this.data.movieIds).includes(movie.id)
          )
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

  loadRecommendedMovies(watchProviderIds?: number[]) {
    const items: { movieIndex?: MovieIndex }[] =
      this.data.pollData?.pollItems || this.data.watchlistItems || [];
    let mostCommonGenres = this.getCommonGenres(
      items.reduce(
        (cum: number[], i: PollItem | WatchlistItem) => [
          ...cum,
          ...(i.movieIndex?.genres || []),
        ],
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

    const years: number[] = (this.data.pollData?.pollItems || []).reduce(
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
        years,
        [],
        watchProviderIds
        // mostCommonKeyWords
      )
      .pipe(
        map((movies) =>
          movies.filter(
            (movie) =>
              !(this.pollMovieIds || this.data.movieIds)?.includes(movie.id)
          )
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
      this.loadRecommendedMovies(this.filteredWatchProviders);
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

  async suggestMovies() {

    const movies = this.data.pollData.pollItems.map(pollItem => pollItem.name);
    this.bottomSheet.open(PollDescriptionSheet, {
      data: { description: undefined, simple: true } as PollDescriptionData,
    });
    if (!this.movieSuggestion) {
      this.movieSuggestion = await this.geminiService.generateNewMovieSuggestions(
        movies
      );
    }
  
    this.bottomSheet._openedBottomSheetRef.instance.data.description =
      this.movieSuggestion;
  }

  private async add(movie: TMDbMovie, confirm: boolean) {
    if (this.data.pollData) {
      this.dialogRef.close(movie);
    } else {
      this.addMovie.emit(movie);
      this.close();
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
