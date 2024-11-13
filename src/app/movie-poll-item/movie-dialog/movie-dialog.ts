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
  AfterViewInit,
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
import { MatChipsModule } from "@angular/material/chips";
import {
  AsyncPipe,
  CommonModule,
  DatePipe,
  DecimalPipe,
} from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Observable, NEVER } from "rxjs";
import {
  openImdb,
  openTmdb,
  openLetterboxd,
  SEEN,
  getSimpleMovieTitle,
} from "../movie-helpers";
import { User } from "../../../model/user";
import { TMDbService } from "../../tmdb.service";
import { filter, first, map, takeUntil, tap } from "rxjs/operators";

import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { SpinnerComponent } from "../../spinner/spinner.component";
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
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet";
import { PollItem } from "../../../model/poll";
import { GeminiService } from "../../gemini.service";
import {
  PollDescriptionData,
  PollDescriptionSheet,
} from "../../../app/poll/poll-description-dialog/poll-description-dialog";
import { PollLinkCopyComponent } from "../../poll-link-copy/poll-link-copy.component";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { isDefined } from "../../helpers";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { ActivatedRoute, Router } from "@angular/router";

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
    PosterComponent,
    MatChipsModule,
    MatBottomSheetModule,
    PollLinkCopyComponent,
    MatSnackBarModule,
  ],
})
export class MovieDialog implements OnInit, AfterViewInit, OnDestroy {
  @Output() voteClicked = new EventEmitter();
  @Output() updateDescription = new EventEmitter<string>();
  @Output() reactionClicked = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  @ViewChild("overview") overviewEl: ElementRef;
  @ViewChild(ScrollPreserverDirective) scrollPreserve: ScrollPreserverDirective;
  @ViewChild("availablePanel") availableListEl: MatExpansionPanel;

  user$: Observable<User | undefined>;
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
  isDefined = isDefined;

  subs = NEVER.subscribe();

  constructor(
    public dialogRef: MatDialogRef<MovieDialog>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private userService: UserService,
    private geminiService: GeminiService,
    private cd: ChangeDetectorRef,
    public domSanitizer: DomSanitizer,
    private bottomSheet: MatBottomSheet,
    private snackBar: MatSnackBar,
    private analytics: Analytics,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      addMovie: boolean;
      movie?: TMDbMovie | MoviePollItemData;
      editable: boolean;
      description: string;
      pollItem: PollItem | undefined;
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
      useNavigation?: boolean;
      outputs?: {
        addMovie?: EventEmitter<TMDbMovie>;
      };
      locked?: boolean;
      landing?: boolean;
      parentMovieId?: number;
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

    this.user$ = this.userService.user$;

    if (this.data.landing) {
      this.movie$.pipe(first(), filter(isDefined)).subscribe((movie) =>
        logEvent(this.analytics, "movie_open", {
          source: "landing_page",
          movieId: movie.id,
        })
      );
    }
  }

  ngAfterViewInit() {
    if (this.data.useNavigation !== false) {
      setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { movieId: String(this.data.movieId) },
          queryParamsHandling: "merge",
        });
      }, 50);
    }

    this.subs.add(
      this.dialog.afterAllClosed.subscribe((x) => console.log("close all?", x))
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();

    setTimeout(() => {
      if (
        this.data.useNavigation !== false &&
        this.dialog.openDialogs.length < 2
      ) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            movieId:
              this.dialog.openDialogs.length === 0 && this.data.parentMovieId
                ? null
                : this.data.parentMovieId
                ? this.data.parentMovieId
                : null,
          },
          queryParamsHandling: "merge",
        });
      }
    }, 50);
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
        tap((movie) => this.movie$.next(movie))
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
      case SEEN:
        return "Seen it";
      case "favorite":
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
        addMovie: this.data.locked ? false : true,
        currentMovieOpen: true,
        parentStr: this.data.parentStr,
        filterMovies: this.data.filterMovies,
        previouslyOpenedDialog:
          this.data.parent !== true ? this.dialogRef : undefined,
        outputs: {
          addMovie: this.addMovie,
        },
        locked: this.data.locked,
        parentMovieId: this.data.movieId,
      },
      panelClass: this.topOfStackClass,
      hasBackdrop: false,
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
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
    this.dialogRef.close();
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

  async addOptionToPoll(pollId: string) {
    (
      await this.pollItemService.addMoviePollItem(
        this.movie$.getValue() as Movie,
        pollId,
        undefined,
        false,
        true
      )
    ).subscribe();
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

  async suggestMovie(user: User | undefined, movie: Movie) {
    if (!user?.id) {
      const snack = this.snackBar.open(
        "Login with Google to view suggestions",
        "Login",
        { duration: 5000 }
      );
      snack
        .onAction()
        .pipe(takeUntil(snack.afterDismissed()))
        .subscribe(() => this.userService.openLoginDialog());
      return;
    }

    let suggestion: string;

    this.bottomSheet.open(PollDescriptionSheet, {
      data: { description: undefined, simple: true } as PollDescriptionData,
    });

    if (this.data.pollItem?.suggestionAI) {
      suggestion = this.data.pollItem.suggestionAI.text;
    } else {
      suggestion = await this.geminiService.generateVoteSuggestionDescription(
        undefined,
        getSimpleMovieTitle(movie)
      );

      if (this.data?.pollItem?.pollId) {
        this.pollItemService.saveSuggestion(
          this.data.pollItem.pollId,
          this.data.pollItem,
          suggestion,
          null
        );
      }
    }

    this.bottomSheet._openedBottomSheetRef.instance.data.description =
      suggestion;
  }

  loginClick() {
    this.userService.openLoginDialog();
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
