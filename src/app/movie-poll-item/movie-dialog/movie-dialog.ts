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
import { openImdb, openTmdb } from "../movie-helpers";
import { User } from "../../../model/user";
import { TMDbService } from "../../tmdb.service";
import { map, takeUntil } from "rxjs/operators";

import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { SpinnerComponent } from "../../spinner/spinner.component";
import { SwipeModule, SwipeEvent } from "ng-swipe";
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
    SwipeModule,
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
  ],
})
export class MovieDialog implements OnInit, OnDestroy {
  @Output() voteClicked = new EventEmitter();
  @Output() updateDescription = new EventEmitter<string>();
  @Output() reactionClicked = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  @ViewChild("overview") overviewEl: ElementRef;
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

  movie$ = new BehaviorSubject<Movie | TMDbMovie | undefined>(undefined);

  openImdb = openImdb;
  openTmdb = openTmdb;

  selectedBackdrop$ = new BehaviorSubject<number>(0);
  recentPolls$: Observable<{ id: string; name: string }[]>;

  subs = NEVER.subscribe();

  constructor(
    public dialogRef: MatDialogRef<Movie>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private userService: UserService,
    private cd: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      addMovie: boolean;
      movie?: TMDbMovie;
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

    this.setBackdrop(this.data.movie?.backdrop_path);
    this.initMovie(this.data.movie?.id || this.data.movieId);

    this.subs.add(
      this.selectedBackdrop$.subscribe((x) => {
        const movie = this.movie$.getValue() as Movie;
        this.setBackdrop(
          movie?.originalObject?.images?.backdrops[
            this.selectedBackdrop$.getValue()
          ]?.file_path
        );
        setTimeout(() => {
          this.cd.detectChanges();
        }, 100);
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
      this.tmdbService
        .loadMovie(movieId)
        .pipe(
          map((movie) => {
            const filteredRecommendations =
              movie.recommendations.results.filter(
                (result) => !this.data.filterMovies.includes(result.id)
              );
            return {
              ...movie,
              recommendations: {
                ...movie.recommendations,
                results: filteredRecommendations,
              },
            };
          })
        )
        .subscribe((movie) => {
          this.movie$.next(movie);
          this.setBackdrop(
            movie?.originalObject?.images?.backdrops[
              this.selectedBackdrop$.getValue()
            ]?.file_path || movie.backdropPath
          );
        });
    }
    if (movieId) {
      this.watchProviders$ = this.tmdbService.loadWatchProviders(movieId);
      this.availableShort$ = this.watchProviders$.pipe(
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
            title = "Streaming witch ads";
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
    // open single "add movie" dialog, otherwise replace content
    if (this.data.currentMovieOpen === false) {
      this.data.movieId = movie.id;
      this.movie$.next(movie);
      this.backdropLoaded$.next(false);
      this.backdrop$.next(undefined);
      this.selectedBackdrop$.next(0);
      this.initMovie(movie.id);
      this.overviewEl.nativeElement.scrollIntoView();
      this.cd.detectChanges();
    } else {
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
          parentStr: this.data.parentStr,
          filterMovies: this.data.filterMovies,
        },
        autoFocus: false,
      });
      openedMovieDialog.componentInstance.addMovie
        .pipe(takeUntil(openedMovieDialog.afterClosed()))
        .subscribe((movie) => {
          this.addMovie.emit(movie);
        });
    }
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

  onSwipeEnd(event: SwipeEvent) {
    if (event.direction === "x" && Math.abs(event.distance) > 30) {
      event.distance < 0 ? this.onSwipeLeft() : this.onSwipeRight();
    }
  }

  openAvailable() {
    this.availableListEl?.open();
    setTimeout(
      () => this.availableListEl?._body.nativeElement.scrollIntoView(),
      200
    );
  }

  addOptionToPoll(pollId: string) {
    this.pollItemService
      .addMoviePollItem(pollId, this.movie$.getValue(), false, true)
      .subscribe();
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
