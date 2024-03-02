import {
  Component,
  OnInit,
  Input,
  ChangeDetectionStrategy,
  Output,
  EventEmitter,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from "@angular/core";
import { PollItem } from "../../model/poll";
import { Movie, MoviePollItemData, TMDbMovie } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { BehaviorSubject, combineLatest, NEVER, Observable } from "rxjs";
import { UserService } from "../user.service";
import {
  delay,
  filter,
  map,
  switchMap,
  tap,
  distinctUntilChanged,
  takeUntil,
} from "rxjs/operators";
import { MatDialog } from "@angular/material/dialog";
import { MovieDialog } from "./movie-dialog/movie-dialog";
import { openImdb, openTmdb } from "./movie-helpers";
import { isEqual } from "../helpers";

interface Reaction {
  label: string;
  tooltip: string;
  count: number;
  reacted: boolean;
}

interface MovieReaction extends Reaction {
  color: string;
}

@Component({
  selector: "movie-poll-item",
  templateUrl: "./movie-poll-item.component.html",
  styleUrls: ["./movie-poll-item.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoviePollItemComponent implements OnInit, OnDestroy, OnChanges {
  @Input() set pollItem(pollItem: PollItem) {
    if (!isEqual(pollItem, this.pollItem$.getValue())) {
      this.pollItem$.next(pollItem);
    }
  }
  // or
  @Input() moviePollItemData: MoviePollItemData | undefined;

  @Input() hasVoted: boolean = false;
  @Input() showCreator: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() progressBarWidth: number; // %
  @Input() editable: boolean = false;
  @Input() creating = false;
  @Input() reactable = true;
  @Input() pollMovies: number[] = [];
  @Input() useSeenReaction = true;

  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  @Output() reaction = new EventEmitter<{
    pollItem: PollItem;
    reaction: string;
    removeReactions: string[];
  }>();
  @Output() setDescription = new EventEmitter<{
    pollItem: PollItem;
    description: string;
  }>();
  @Output() addMovie = new EventEmitter<TMDbMovie | Movie>();

  pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);

  get pollItem() {
    return this.pollItem$.getValue();
  }

  movie$: Observable<Readonly<Movie>>;
  posterImage$: Observable<Readonly<string>>;
  editPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  editReactionsPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  movieReactionsOpened$ = new BehaviorSubject<boolean>(false);
  editDescription$ = new BehaviorSubject<string | undefined>(undefined);
  shortened = true;

  availableReactions$: Observable<string[]>;
  hasReactions$: Observable<boolean>;
  description$: Observable<string>;
  movieReactions$: Observable<MovieReaction[]>;

  reactionClickDisabled$ = new BehaviorSubject<boolean>(true);

  openMovie: any | undefined;

  readonly movieReactions: { label: string; tooltip: string; color: string }[] =
    [
      { label: "fa-eye", tooltip: "Seen", color: "#FF8500" },
      // TODO: Consider refactoring these into favorite movie list and movie watchlist list
      // { label: "fa-heart", tooltip: "Favorite", color: "#6cd577" },
      // { label: "fa-ban", tooltip: "Not this", color: "red" },
    ];

  private subs = NEVER.subscribe();

  openImdb = openImdb;
  openTmdb = openTmdb;

  ngOnChanges(changes: SimpleChanges) {
    if (changes.hasVoted) {
      if (this.openMovie) {
        this.openMovie.componentInstance.data.hasVoted =
          changes.hasVoted.currentValue;
      }
    }
  }

  constructor(
    public movieService: TMDbService,
    public dialog: MatDialog,
    private userService: UserService
  ) {
    const user$ = this.userService.userSubject;

    this.movieReactions$ = combineLatest([this.pollItem$, user$]).pipe(
      filter(([pollItem]) => pollItem !== undefined),
      distinctUntilChanged(isEqual),
      map(([pollItem]) => pollItem.reactions),
      map((reactions) =>
        this.movieReactions
          .filter((reaction) =>
            this.useSeenReaction === false ? reaction.label !== "fa-eye" : true
          )
          .map((reaction) => {
            const count = this.getReactedCount(reactions, reaction.label);
            return {
              ...reaction,
              tooltip:
                count > 0
                  ? reaction.tooltip +
                    ": " +
                    this.getReactionText(reactions, reaction.label)
                  : undefined,
              count,
              reacted: this.userHasReacted(reactions, reaction.label),
            };
          })
      )
    );

    this.subs.add(
      this.editReactionsPollItem$
        .pipe(
          distinctUntilChanged(),
          tap(() => this.reactionClickDisabled$.next(true)),
          delay(0.7)
        )
        .subscribe(() => this.reactionClickDisabled$.next(false))
    );
  }

  ngOnInit() {
    this.movie$ = this.pollItem$.pipe(
      map((pollItem) =>
        pollItem.moviePollItemData && pollItem.moviePollItemData.posterPath
          ? undefined
          : pollItem?.movieId
      ),
      filter((movieId) => !!movieId),
      switchMap((movieId) =>
        this.movieService
          .loadCombinedMovie(movieId)
          .pipe(filter((movie) => !!movie))
      )
    );

    // "w92",
    // "w154",
    // "w185",
    // "w342",
    // "w500",
    // "w780",

    // images = `https://images.unsplash.com/photo-1434725039720-aaad6dd32dfe?fm=jpg 700w,
    //         https://images.unsplash.com/photo-1437818628339-19ded67ade8e?fm=jpg 1100w`;
    this.posterImage$ = this.movie$.pipe(
      map((movie) => movie.originalObject.poster_path),
      map(
        // Images are quite low quality, so we'll downsize from larger than needed
        (posterPath) => `
        https://image.tmdb.org/t/p/w92${posterPath} 200w,
        https://image.tmdb.org/t/p/w154${posterPath} 340w,
        https://image.tmdb.org/t/p/w185${posterPath} 500w,
        https://image.tmdb.org/t/p/w342${posterPath} 700w,
      `
      )
    );

    // provider: {
    //   ...available.provider.map((p) => ({
    //     ...p,
    //     logo_path: p.logo_path.replace(".jpg", ".svg"),
    //   })),
    // },

    // this.movie$.pipe(take(1)).subscribe(movie => this.host.nativeElement.style.setProperty(`--value`, "" + movie.tmdbRating))
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  remove(pollItem: PollItem): void {
    this.onRemoved.emit(pollItem);
  }

  clickReaction(pollItem: PollItem, reaction: string) {
    if (this.reactionClickDisabled$.getValue() === true) {
      return;
    }
    const removeReactions: string[] = this.movieReactions
      .map((r) => r.label)
      .includes(reaction)
      ? (pollItem.reactions || [])
          .filter((r) => r.users.some((u) => this.userService.isCurrentUser(u)))
          .filter((r) =>
            this.movieReactions.map((x) => x.label).includes(r.label)
          )
          .map((r) => r.label)
      : [];
    this.reaction.emit({ pollItem, reaction, removeReactions });
  }

  descriptionButtonClick(pollItem: PollItem) {
    const id = this.editPollItem$.getValue();

    if (id) {
      this.changeDescription(pollItem, this.editDescription$.getValue());
      this.editDescription$.next(undefined);
      this.editPollItem$.next(undefined);
    } else {
      this.editPollItem$.next(pollItem.id);
    }
  }

  changeDescription(pollItem: PollItem, description: string) {
    this.setDescription.emit({ pollItem, description });
  }

  async showMovie(moviePollitemData: MoviePollItemData) {
    this.openMovie = this.dialog.open(MovieDialog, {
      height: "85%",
      width: "90%",
      maxWidth: "450px",

      data: {
        editable: this.editable,
        description: this.pollItem$.getValue().description,
        pollItemId: this.pollItem$.getValue().id,
        isVoteable: this.voteable,
        isReactable: this.reactable,
        movieReactions$: this.movieReactions$,
        hasVoted: this.hasVoted,
        voteCount: this.pollItem$.getValue().voters.length,
        voters: this.pollItem$.getValue().voters,
        movieId: this.pollItem$.getValue().movieId,
        currentMovieOpen: true,
        filterMovies: this.pollMovies,
        movie: moviePollitemData,
        parent: true,
      },
      autoFocus: false,
      restoreFocus: false,
    });
    this.openMovie.afterClosed().subscribe((result) => {
      this.openMovie = undefined;
    });

    this.pollItem$
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((pollItem) => {
        this.openMovie.componentInstance.data.voteCount =
          pollItem.voters.length;
        this.openMovie.componentInstance.data.voters =
          this.pollItem$.getValue().voters;
        this.openMovie.componentInstance.data.description =
          this.pollItem$.getValue().description;
      });

    // Vote button logic
    this.openMovie.componentInstance.voteClicked
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe(() => this.optionClicked.emit(this.pollItem$.getValue()));

    // Movie reaction logic
    this.openMovie.componentInstance.reactionClicked
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((reaction) =>
        this.clickReaction(this.pollItem$.getValue(), reaction)
      );

    // Description update logic
    this.openMovie.componentInstance.updateDescription
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((description) =>
        this.changeDescription(this.pollItem$.getValue(), description)
      );

    // Add movie logic
    this.openMovie.componentInstance.addMovie
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((movie) => this.addMovie.emit(movie));
  }

  private getReactedCount(
    reactions: PollItem["reactions"],
    reaction: string
  ): number {
    return (reactions?.find((r) => r.label === reaction)?.users || []).length;
  }

  private userHasReacted(
    reactions: PollItem["reactions"],
    reaction: string
  ): boolean {
    return (reactions || [])
      .find((r) => r.label === reaction)
      ?.users.some((user) => this.userService.isCurrentUser(user));
  }

  private getReactionText(
    reactions: PollItem["reactions"],
    reaction: string
  ): string {
    return `${(reactions?.find((r) => r.label === reaction)?.users || [])
      .map((u) => u.name)
      .join(", ")}`;
  }
}
