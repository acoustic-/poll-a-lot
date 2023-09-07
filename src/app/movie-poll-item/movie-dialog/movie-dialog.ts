import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { Movie, TMDbMovie, WatchProviders } from "../../../model/tmdb";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatExpansionModule } from "@angular/material/expansion";
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
import { takeUntil } from "rxjs/operators";
import { MovieScoreComponent } from "../movie-score/movie-score.component";
import { SpinnerComponent } from "../../spinner/spinner.component";

@Component({
  selector: "movie-dialog",
  templateUrl: "movie-dialog.html",
  styleUrls: ["./movie-dialog.scss"],
  standalone: true,
  //   changeDetection: ChangeDetectionStrategy.OnPush,
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
  ],
})
export class MovieDialog implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<Movie>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
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

  editDescription: string | undefined;

  watchProviders$: Observable<WatchProviders>;
  selectedWatchProviderCountry = "FI";

  movie$ = new BehaviorSubject<Movie | undefined>(undefined);

  panelOpenState = false;

  getMetaBgColor = getMetaBgColor;
  openImdb = openImdb;
  openTmdb = openTmdb;
  getDirector = getDirector;
  getWriter = getWriter;
  getActors = getActors;
  getProductionsCountries = getProductionCountries;

  selectedBackdrop = 0;

  ngOnInit() {
    this.initMovie();
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
    }

    if (this.data.movie) {
      this.movie$.next(this.data.movie);
    }

    this.movie$.subscribe((x) => console.log("movie", x));
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  descriptionButtonClick(): void {
    console.log("Description click..", this.data.description);
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
        .subscribe((movie) => this.addMovie.emit(movie));
    }
  }

  getWatchProviderCountries(watchProviders: WatchProviders): string[] {
    return Object.keys(watchProviders.results);
  }

  clickAddMovie(movie: TMDbMovie) {
    console.log("click add movie", movie);
    this.addMovie.emit(movie);
  }

  closeDialog() {
    this.dialogRef.close();
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
