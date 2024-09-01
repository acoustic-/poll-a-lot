import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  OnInit,
  OnDestroy,
  Output,
  ViewChild,
} from "@angular/core";
import {
  Movie,
  MoviePollItemData,
  TMDbMovie,
  WatchProviders,
  WatchService,
} from "../../../model/tmdb";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MatExpansionModule,
  MatExpansionPanel,
} from "@angular/material/expansion";
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from "@angular/material/dialog";
import { MatMenuModule } from "@angular/material/menu";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  AsyncPipe,
  CommonModule,
  DatePipe,
  DecimalPipe,
} from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Observable, NEVER } from "rxjs";
import { openImdb, openTmdb, openLetterboxd } from "../movie-helpers";
import { User } from "../../../model/user";
import { TMDbService } from "../../tmdb.service";
import {
  filter,
  map,
  takeUntil,
  tap,
} from "rxjs/operators";

import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { SpinnerComponent } from "../../spinner/spinner.component";
// import { SwipeModule, SwipeEvent } from "ng-swipe";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { CountryFlagNamePipe } from "../../country-name-flag.pipe";
import { MetaColorPipe } from "../../meta-bg-color.pipe";
import { MovieCreditPipe } from "../../movie-credit.pipe";
import { ProductionCoutryPipe } from "../../production-country.pipe";

import { MatSelectModule } from "@angular/material/select";
import { VotersPipe } from "../../voters.pipe";
import { UserService } from "../../user.service";
import { WatchListMarker } from "../../watch-list-marker/watch-list-marker.component";
import { PollItemService } from "../../poll-item.service";
import { ScreenHeightPipe } from "../../screen-height.pipe";
import { HyphenatePipe } from "../../hyphen.pipe";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { ScrollPreserverDirective } from "../../scroll-preserver.directive";
import { DialogRef } from "@angular/cdk/dialog";
import { defaultDialogOptions, defaultDialogHeight } from "../../common";
import { PosterComponent } from "../../poster/poster.component";

@Component({
  selector: "movie-dialog",
  templateUrl: "movie-dialog.html",
  styleUrls: ["./movie-dialog.scss"],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    DatePipe,
    DecimalPipe,
    MatIconModule,
    AsyncPipe,
    MatExpansionModule,
    MovieScoreComponent,
    SpinnerComponent,
    // SwipeModule,
    LazyLoadImageModule,
    CountryFlagNamePipe,
    MetaColorPipe,
    MovieCreditPipe,
    ProductionCoutryPipe,
    MatSelectModule,
    VotersPipe,
    WatchListMarker,
    MatMenuModule,
    ScreenHeightPipe,
    HyphenatePipe,
    ScrollPreserverDirective,
    PosterComponent
  ],
})
export class MovieDialog implements OnInit, OnDestroy {
  @Output() voteClicked = new EventEmitter();
  @Output() updateDescription = new EventEmitter<string>();
  @Output() reactionClicked = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  @ViewChild("overview") overviewEl: ElementRef;
  @ViewChild(ScrollPreserverDirective) scrollPreserve: ScrollPreserverDirective;
  @ViewChild("availablePanel") availableListEl: MatExpansionPanel;

  editDescription: string | undefined;

  backdrop$ = new BehaviorSubject<string | undefined>(undefined);
  backdropLoaded$ = new BehaviorSubject<boolean>(false);

  watchProviders$: Observable<WatchProviders>;
  selectedWatchProviderCountry = "FI";

  availableShort$: Observable<
    { title: string; provider: WatchService } | undefined
  >;

  maxBgCount = 15;

  movie$ = new BehaviorSubject<
    Movie | TMDbMovie | MoviePollItemData | undefined
  >(undefined);

  openImdb = openImdb;
  openTmdb = openTmdb;
  openLetterboxd = openLetterboxd;

  selectedBackdrop$ = new BehaviorSubject<number>(0);
  recentPolls$: Observable<{ id: string; name: string }[]>;

  letterboxdCrew$ = new BehaviorSubject<undefined | {}>(undefined);
  trailerUrl$ = new BehaviorSubject<undefined | SafeResourceUrl>(undefined);

  openStories$ = new BehaviorSubject<string[]>([]);

  topOfStackClass = "top-of-stack";
  midStackClass = "mid-of-stack";

  subs = NEVER.subscribe();

  constructor(
    public dialogRef: MatDialogRef<MovieDialog>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private userService: UserService,
    private cd: ChangeDetectorRef,
    public domSanitizer: DomSanitizer,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      addMovie: boolean;
      movie?: TMDbMovie | MoviePollItemData;
      editable: boolean;
      description: string;
      pollItemId: string | undefined;
      movieId: number;
      isVoteable: boolean;
      isReactable: boolean;
      movieReactions$: Observable<any[]>;
      hasVoted: boolean;
      voteCount: number;
      voters: User[];
      currentMovieOpen: boolean;
      parentStr?: string;
      showRecentPollAdder: boolean;
      filterMovies: number[];
      previouslyOpenedDialog?: DialogRef;
      parent: boolean;
      outputs?: {
        addMovie?: EventEmitter<TMDbMovie>;
      };
    }
  ) {
    this.recentPolls$ = this.userService
      .getUserData$()
      .pipe(map((data) => data?.latestPolls));
  }

  ngOnInit() {
    if (this.data.movie) {
      this.movie$.next(this.data.movie);
    }

    if (this.data.outputs) {
      this.addMovie = this.data.outputs.addMovie;
    }

    if (this.data.previouslyOpenedDialog) {
      setTimeout(() => this.data.previouslyOpenedDialog.close(), 100);
    }

    this.setBackdrop(
      (this.data.movie as TMDbMovie)?.images?.backdrop[0]?.file_path ||
        (this.data.movie as MoviePollItemData)?.backdropPath
    );
    this.initMovie(this.data.movie?.id || this.data.movieId);

    this.subs.add(
      this.selectedBackdrop$.subscribe((i) => {
        const movie = this.movie$.getValue() as Movie;
        this.setBackdrop(
          movie?.originalObject?.images?.backdrops[i]?.file_path
        );
        setTimeout(() => {
          this.cd.detectChanges();
        }, 100);
      })
    );

    this.availableShort$ = this.movie$.pipe(
      filter((movie: Movie) => !!movie?.watchProviders),
      map((movie: Movie) => movie.watchProviders),
      map((result) => {
        let show;
        let title;

        const flatrate =
          result.results[this.selectedWatchProviderCountry]?.flatrate;
        const free = result.results[this.selectedWatchProviderCountry]?.free;
        const rent = result.results[this.selectedWatchProviderCountry]?.rent;
        const buy = result.results[this.selectedWatchProviderCountry]?.buy;
        const ads = result.results[this.selectedWatchProviderCountry]?.ads;

        if (free) {
          title = "Streaming now";
          show = free[0];
        } else if (flatrate) {
          title = "Streaming now";
          show = flatrate[0];
        } else if (ads) {
          title = "Streaming (ads)";
          show = ads[0];
        } else if (rent) {
          title = "Available";
          show = rent[0];
        } else if (buy) {
          title = "Available";
          show = buy[0];
        } else {
          show = undefined;
        }
        return show ? { title, provider: show } : undefined;
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  onStateChangeBackdropLoaded(event) {
    if (event.reason === "finally") {
      setTimeout(() => {
        this.backdropLoaded$.next(true);
        this.cd.detectChanges();
      });
    }
  }

  initMovie(movieId: number) {
    if (movieId) {
      const movieObs$ = this.tmdbService.loadCombinedMovie(movieId, false).pipe(
        map((movie) => {
          const filteredRecommendations = movie.recommendations.results.filter(
            (result) => !(this.data.filterMovies || []).includes(result.id)
          );
          return {
            ...movie,
            recommendations: {
              ...movie.recommendations,
              results: filteredRecommendations,
            },
          };
        }),
        tap((movie) => this.setMovie(movie)),
        tap((movie) => this.movie$.next(movie)),
      );
      this.subs.add(movieObs$.subscribe());
    }
  }

  setMovie(movie: Movie) {
    this.movie$.next(movie);
    if ((movie as Movie)?.letterboxdItem) {
      this.letterboxdCrew$.next(
        movie.letterboxdItem.contributions.filter((c) => c.type !== "Actor")
      );
      const id = movie.letterboxdItem.trailer?.url.split("?v=")[1];
      const embedUrl = `https://www.youtube.com/embed/${id}`;

      this.trailerUrl$.next(
        this.domSanitizer.bypassSecurityTrustResourceUrl(embedUrl)
      );
    }

    if (movie?.originalObject || movie.backdropPath) {
      this.setBackdrop(
        movie?.originalObject?.images?.backdrops[
          this.selectedBackdrop$.getValue()
        ]?.file_path || movie.backdropPath
      );
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  descriptionButtonClick(): void {
    if (this.editDescription) {
      this.updateDescription.emit(this.editDescription);
      this.editDescription = undefined;
    } else if (this.editDescription === "") {
      this.editDescription = undefined;
    } else {
      this.editDescription = this.data.description || "";
    }
  }

  clickReaction(reaction: string) {
    this.reactionClicked.emit(reaction);
  }

  voteButtonClick(): void {
    this.voteClicked.emit("click");
  }

  translateReactionLabel(input: string): string {
    switch (input) {
      case "fa-eye":
        return "Seen it";
      case "fa-heart":
        return "Love it";
      default:
        return "Not this!";
    }
  }

  openAnotherMovie(movie: TMDbMovie) {
    if (this.data.currentMovieOpen === false) {
      this.dialogRef.close();
    }
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
        filterMovies: this.data.filterMovies,
        previouslyOpenedDialog:
          this.data.parent !== true ? this.dialogRef : undefined,
        outputs: {
          addMovie: this.addMovie,
        },
      },
      panelClass: this.topOfStackClass,
      hasBackdrop: false,
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()), tap(x => console.log("movie-dialog, openMovieDialog add-movie", x)))
      .subscribe((movie) => {
        this.addMovie.emit(movie);
      });
    openedMovieDialog
      .afterClosed()
      .subscribe(
        this.dialogRef.componentInstance.overviewEl.nativeElement.scrollIntoView()
      );
  }

  getWatchProviderCountries(watchProviders: WatchProviders): string[] {
    return Object.keys(watchProviders.results);
  }

  clickAddMovie(movie: TMDbMovie) {
    this.addMovie.emit(movie);
  }

  closeDialog() {
    this.dialogRef.close();
  }

  onSwipeLeft() {
    const current = this.selectedBackdrop$.getValue();
    const movie = this.movie$.getValue() as Movie;
    const total =
      movie.originalObject.images.backdrops.slice(0, this.maxBgCount).length -
      1;
    if (current < total) {
      this.selectedBackdrop$.next(current + 1);
    }
  }

  onSwipeRight() {
    const current = this.selectedBackdrop$.getValue();
    if (current > 0) {
      this.selectedBackdrop$.next(current - 1);
    }
  }

  // onSwipeEnd(event: SwipeEvent) {
  //   if (event.direction === "x" && Math.abs(event.distance) > 30) {
  //     event.distance < 0 ? this.onSwipeLeft() : this.onSwipeRight();
  //   }
  // }

  openAvailable() {
    this.availableListEl?.open();
    setTimeout(
      () => this.availableListEl?._body.nativeElement.scrollIntoView(),
      200
    );
  }

  addOptionToPoll(pollId: string) {
    this.pollItemService
      .addMoviePollItem(this.movie$.getValue() as Movie, pollId, false, true)
      .subscribe();
  }

  toggleStory(id: string) {
    if (this.openStories$.getValue().includes(id)) {
      this.openStories$.next(
        this.openStories$.getValue().filter((i) => i !== id)
      );
    } else {
      this.scrollPreserve.prepareFor("up");
      this.openStories$.next([...this.openStories$.getValue(), id]);
      setTimeout(() => this.scrollPreserve.restore());
    }
  }

  private setBackdrop(current: string | undefined) {
    if (current) {
      this.backdrop$.next("https://image.tmdb.org/t/p/" + "w780" + current);
    }
  }

  private urlify(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(
      urlRegex,
      (url) =>
        `<span class="with-launch-icon"><a class="outside-link" target="_blank" href="${url}">${url}</a></span>`
    );
  }
}
