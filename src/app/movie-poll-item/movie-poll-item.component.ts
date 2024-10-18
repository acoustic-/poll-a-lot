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
import { openImdb, openTmdb, SEEN } from "./movie-helpers";
import { isEqual } from "../helpers";
import { defaultDialogHeight, defaultDialogOptions } from "../common";

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
  @Input() draggable = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() progressBarWidth: number; // %
  @Input() editable: boolean = false;
  @Input() creating = false;
  @Input() reactable = true;
  @Input() pollMovies: number[] = [];
  @Input() useSeenReaction = true;
  @Input() condensedView = false;
  @Input() orderNumber: number | false = false;
  @Input() locked = false;


  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  @Output() reaction = new EventEmitter<string>();
  @Output() setDescription = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie | Movie>();

  pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);

  get pollItem() {
    return this.pollItem$.getValue();
  }

  movie$: Observable<Readonly<Movie>>;
  editPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  editReactionsPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  movieReactionsOpened$ = new BehaviorSubject<boolean>(false);
  editDescription$ = new BehaviorSubject<string | undefined>(undefined);
  shortened = true;

  availableReactions$: Observable<string[]>;
  hasReactions$: Observable<boolean>;
  description$: Observable<string>;
  movieReactions$: Observable<MovieReaction[]>;
  movieReactionWatched$: Observable<boolean>;

  reactionClickDisabled$ = new BehaviorSubject<boolean>(true);

  openMovie: any | undefined;

  readonly movieReactions: { label: string; tooltip: string; color: string }[] =
    [
      { label: SEEN, tooltip: "Seen", color: "#FF8500" },
      // TODO: Consider refactoring these into favorite movie list and movie watchlist list
      // { label: "fa-heart", tooltip: "Favorite", color: "#6cd577" }, // favorite
      // { label: "fa-ban", tooltip: "Not this", color: "red" }, // block
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
    const user$ = this.userService.user$;

    this.movieReactions$ = combineLatest([this.pollItem$, user$]).pipe(
      filter(([pollItem]) => pollItem !== undefined),
      distinctUntilChanged(isEqual),
      map(([pollItem]) => pollItem),
      map((pollItem: PollItem) => pollItem.reactions),
      map((reactions) =>
        this.movieReactions
          .filter((reaction) =>
            this.useSeenReaction === false ? reaction.label !== SEEN : true
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

    this.movieReactionWatched$ = this.movieReactions$.pipe(
      map((reactions) =>
        reactions.some(
          (reaction) => reaction.label === SEEN && reaction.count > 0
        )
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

  clickReaction(reaction: string) {
    if (this.reactionClickDisabled$.getValue() === true) {
      return;
    }
    this.reaction.emit(reaction);
  }

  descriptionButtonClick(pollItem: PollItem) {
    const id = this.editPollItem$.getValue();

    if (id) {
      this.changeDescription(this.editDescription$.getValue());
      this.editDescription$.next(undefined);
      this.editPollItem$.next(undefined);
    } else {
      this.editPollItem$.next(pollItem.id);
    }
  }

  changeDescription(description: string) {
    this.setDescription.emit(description);
  }

  async showMovie(moviePollitemData: MoviePollItemData) {
    this.openMovie = this.dialog.open(MovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        editable: this.editable,
        description: this.pollItem.description,
        pollItemId: this.pollItem.id,
        isVoteable: this.voteable,
        isReactable: this.reactable,
        movieReactions$: this.movieReactions$,
        hasVoted: this.hasVoted,
        voteCount: this.pollItem.voters.length,
        voters: this.pollItem.voters,
        movieId: this.pollItem.movieId,
        currentMovieOpen: true,
        filterMovies: this.pollMovies,
        movie: moviePollitemData,
        parent: true,
        locked: this.locked
      },
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
          pollItem.voters;
        this.openMovie.componentInstance.data.description =
          pollItem.description;
      });

    // Vote button logic
    this.openMovie.componentInstance.voteClicked
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe(() => this.optionClicked.emit(this.pollItem));

    // Movie reaction logic
    this.openMovie.componentInstance.reactionClicked
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((reaction) => this.clickReaction(reaction));

    // Description update logic
    this.openMovie.componentInstance.updateDescription
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((description) =>
        this.changeDescription(description)
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
