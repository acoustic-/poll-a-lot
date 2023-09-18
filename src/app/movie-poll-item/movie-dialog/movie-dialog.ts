import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  OnInit,
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
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  AsyncPipe,
  CommonModule,
  DatePipe,
  DecimalPipe,
} from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Observable } from "rxjs";
import {
  getActors,
  getDirector,
  getMetaBgColor,
  getProductionCountries,
  getWriter,
  openImdb,
  openTmdb,
} from "../movie-helpers";
import { User } from "../../../model/poll";
import { TMDbService } from "../../tmdb.service";
import { map, takeUntil } from "rxjs/operators";
import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { SpinnerComponent } from "../../spinner/spinner.component";
import { SwipeModule, SwipeEvent } from "ng-swipe";

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
  ],
})
export class MovieDialog implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<Movie>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private cd: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      addMovie: boolean;
      movie: Movie;
      editable: boolean;
      description: string;
      pollItemId: string | undefined;
      movieId: number | undefined;
      isVoteable: boolean;
      movieReactions$: Observable<any[]>;
      hasVoted: boolean;
      voteCount: number;
      voters: User[];
    }
  ) {}

  @Output() voteClicked = new EventEmitter();
  @Output() updateDescription = new EventEmitter<string>();
  @Output() reactionClicked = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  @ViewChild("backdrop") backdropEl: ElementRef;
  @ViewChild("availablePanel") availableListEl: MatExpansionPanel;

  editDescription: string | undefined;

  watchProviders$: Observable<WatchProviders>;
  selectedWatchProviderCountry = "FI";

  availableShort$: Observable<
    { title: string; provider: WatchService } | undefined
  >;

  maxBgCount = 15;

  movie$ = new BehaviorSubject<Movie | undefined>(undefined);

  getMetaBgColor = getMetaBgColor;
  openImdb = openImdb;
  openTmdb = openTmdb;
  getDirector = getDirector;
  getWriter = getWriter;
  getActors = getActors;
  getProductionsCountries = getProductionCountries;

  selectedBackdrop$ = new BehaviorSubject<number>(0);

  ngOnInit() {
    this.initMovie();

    this.selectedBackdrop$.subscribe((x) => {
      setTimeout(() => this.cd.detectChanges(), 100);
    });
  }

  initMovie() {
    if (this.data.movieId || !this.data.pollItemId) {
      this.tmdbService.loadMovie(this.data.movieId).subscribe((response) => {
        this.movie$.next(response);
        this.backdropEl?.nativeElement.scrollIntoView();
      });
    }
    if (this.data.movieId) {
      this.watchProviders$ = this.tmdbService.loadWatchProviders(
        this.data.movieId
      );
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

    if (this.data.movie) {
      this.movie$.next(this.data.movie);
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  descriptionButtonClick(): void {
    if (this.editDescription) {
      this.updateDescription.emit(this.editDescription);
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
    console.log("vote  click");
  }

  getVoterNames(voters: User[]): string {
    return voters.map((voter) => voter.name).join(", ");
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
    if (this.data.addMovie === true) {
      this.data.movieId = movie.id;
      this.movie$.next(undefined);
      this.initMovie();
    } else {
      const openedMovieDialog = this.dialog.open(MovieDialog, {
        height: "90%",
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
        .subscribe((movie) => this.addMovie.emit(movie));
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
    const movie = this.movie$.getValue();
    const total = movie.originalObject.images.backdrops.slice(
      0,
      this.maxBgCount
    ).length;
    console.log(current, total);
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
    console.log(
      `SwipeEnd direction: ${event.direction} and distance: ${event.distance}`
    );
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

  private urlify(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(
      urlRegex,
      (url) =>
        `<span class="with-launch-icon"><a class="outside-link" target="_blank" href="${url}">${url}</a></span>`
    );
  }
}
