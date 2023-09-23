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
  ElementRef,
} from "@angular/core";
import { PollItem } from "../../model/poll";
import { Movie, TMDbMovie } from "../../model/tmdb";
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
import { isEqual } from "lodash";
import { MatDialog } from "@angular/material/dialog";
import { MovieDialog } from "./movie-dialog/movie-dialog";
import {
  getMetaBgColor,
  openImdb,
  openTmdb,
  getDirector,
  getWriter,
  getActors,
  getProductionCountries,
} from "./movie-helpers";
import { MovieScoreComponent } from "./movie-score/movie-score.component";

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
  @Input() hasVoted: boolean = false;
  @Input() showCreator: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() progressBarWidth: number; // %
  @Input() editable: boolean = false;
  @Input() creating = false;
  @Input() reactable = true;

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
  @Output() addMovie = new EventEmitter<TMDbMovie>();

  pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);
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
  // defaultReactions$: Observable<Reaction[]>;
  movieReactions$: Observable<MovieReaction[]>;

  reactionClickDisabled$ = new BehaviorSubject<boolean>(true);

  openMovie: any | undefined;
  posterReady = false;

  // readonly defaultReactions: string[] = [
  //   "🔥",
  //   "😂",
  //   "💩",
  //   "🙈",
  //   "🎉",
  //   "😍",
  //   "😅",
  //   "🤦",
  //   "🤩",
  //   "😢",
  //   "🍿",
  //   "🤓",
  //   "😈",
  //   "😱",
  // ];
  readonly movieReactions: { label: string; tooltip: string; color: string }[] =
    [
      { label: "fa-eye", tooltip: "Seen", color: "#FF8500" },
      // TODO: Consider refactoring these into favorite movie list and movie watchlist list
      // { label: "fa-heart", tooltip: "Favorite", color: "#6cd577" },
      // { label: "fa-ban", tooltip: "Not this", color: "red" },
    ];

  private subs = NEVER.subscribe();

  getMetaBgColor = getMetaBgColor;
  openImdb = openImdb;
  openTmdb = openTmdb;
  getDirector = getDirector;
  getWriter = getWriter;
  getActors = getActors;
  getProductionCountries = getProductionCountries;

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
    private userService: UserService,
    private host: ElementRef<HTMLElement>
  ) {
    const user$ = this.userService.userSubject;

    // this.availableReactions$ = combineLatest([this.pollItem$, user$]).pipe(
    //   filter(([pollItem]) => pollItem !== undefined),
    //   map(([pollItem]) =>
    //     this.defaultReactions.filter(
    //       (reaction) =>
    //         !(pollItem.reactions || [])
    //           .find((r) => r.label === reaction)
    //           ?.users.some((user) => this.userService.isCurrentUser(user))
    //     )
    //   )
    // );

    // this.hasReactions$ = this.pollItem$.pipe(
    //   filter((pollItem) => pollItem !== undefined),
    //   map((pollItem) =>
    //     (pollItem.reactions || [])
    //       .filter((r) => this.defaultReactions.includes(r.label))
    //       .some((r) => r.users.length > 0)
    //   )
    // );

    // this.description$ = this.pollItem$.pipe(
    //   filter((pollItem) => pollItem !== undefined),
    //   map((pollItem) => pollItem.description),
    //   distinctUntilChanged(),
    //   map((description) => this.urlify(description || ""))
    // );

    // this.defaultReactions$ = combineLatest([this.pollItem$, user$]).pipe(
    //   filter(([pollItem]) => pollItem !== undefined),
    //   distinctUntilChanged(isEqual),
    //   map(([pollItem]) => pollItem.reactions),
    //   map((reactions) =>
    //     this.defaultReactions.map((reaction) => ({
    //       label: reaction,
    //       tooltip: this.getReactionText(reactions, reaction),
    //       count: this.getReactedCount(reactions, reaction) || undefined,
    //       reacted: this.userHasReacted(reactions, reaction),
    //     }))
    //   )
    // );

    this.movieReactions$ = combineLatest([this.pollItem$, user$]).pipe(
      filter(([pollItem]) => pollItem !== undefined),
      distinctUntilChanged(isEqual),
      map(([pollItem]) => pollItem.reactions),
      map((reactions) =>
        this.movieReactions.map((reaction) => {
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
      filter((pollItem) => pollItem !== undefined),
      switchMap((pollItem) =>
        this.movieService
          .loadMovie(pollItem.movieId)
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
        (posterPath) => `
        https://image.tmdb.org/t/p/w92${posterPath} 300w,
        https://image.tmdb.org/t/p/w154${posterPath} 400w,
        https://image.tmdb.org/t/p/w185${posterPath} 500w,
        https://image.tmdb.org/t/p/w342${posterPath} 700w,
        https://image.tmdb.org/t/p/w500${posterPath} 800w,
        https://image.tmdb.org/t/p/w780${posterPath} 1100w,
      `
      )
    );

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

  async showMovie(movie: Movie) {
    this.openMovie = this.dialog.open(MovieDialog, {
      height: "85%",
      width: "90%",
      maxWidth: "450px",

      data: {
        movie,
        editable: this.editable,
        description: this.pollItem$.getValue().description,
        pollItemId: this.pollItem$.getValue().id,
        isVoteable: true,
        movieReactions$: this.movieReactions$,
        hasVoted: this.hasVoted,
        voteCount: this.pollItem$.getValue().voters.length,
        voters: this.pollItem$.getValue().voters,
        movieId: this.pollItem$.getValue().movieId,
      },
      autoFocus: false,
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

    this.openMovie.afterClosed().subscribe((x) => console.log("closed"));
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
