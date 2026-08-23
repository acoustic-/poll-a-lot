import { Component, OnInit, Input, ChangeDetectionStrategy, Output, EventEmitter, OnDestroy, OnChanges, SimpleChanges, inject } from "@angular/core";
import { PollItem } from "../../model/poll";
import { LetterboxdSeenInfo } from "../../model/letterboxd";
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
import { openImdb, openTmdb, SEEN } from "./movie-helpers";
import { isEqual } from "../helpers";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MovieDialogService } from "../movie-dialog.service";
import { AwardsService } from "../awards.service";
import { PollItemVoter, filteredVoteCount } from "../poll/poll-voters";
import { voterKey } from "../user-identity";
import { canAddPoint, canRemovePoint } from "../poll-item.service";
import { ResolvedIdentity } from "../user-identity.service";
import { MatCard } from "@angular/material/card";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { PosterComponent } from "../poster/poster.component";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIcon } from "@angular/material/icon";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { MatIconButton, MatButton } from "@angular/material/button";
import { MatMenuTrigger, MatMenu, MatMenuItem } from "@angular/material/menu";
import { LetterboxdBadgeComponent } from "../letterboxd-badge/letterboxd-badge.component";
import { AvatarStackComponent } from "../avatar-stack/avatar-stack.component";
import { VoterComponent } from "../voter/voter.component";
import { PointVoteStepperComponent } from "../voter/point-vote-stepper/point-vote-stepper.component";
import { AsyncPipe, DatePipe } from "@angular/common";
import { MovieCreditPipe } from "../movie-credit.pipe";
import { ProductionCoutryPipe } from "../production-country.pipe";
import { HyphenatePipe } from "../hyphen.pipe";

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
    imports: [MatCard, LazyLoadImageModule, PosterComponent, MatTooltip, MatIcon, UserAvatarComponent, MatIconButton, MatMenuTrigger, MatMenu, MatMenuItem, LetterboxdBadgeComponent, MatButton, AvatarStackComponent, VoterComponent, PointVoteStepperComponent, AsyncPipe, DatePipe, MovieCreditPipe, ProductionCoutryPipe, HyphenatePipe]
})
export class MoviePollItemComponent implements OnInit, OnDestroy, OnChanges {
  movieService = inject(TMDbService);
  private movieDialog = inject(MovieDialogService);
  private userService = inject(UserService);
  private snackbar = inject(MatSnackBar);
  private movieAwardsService = inject(AwardsService);

  @Input() set pollItem(pollItem: PollItem) {
    if (!isEqual(pollItem, this.pollItem$.getValue())) {
      this.pollItem$.next(pollItem);
    }
  }
  // or
  @Input() moviePollItemData: MoviePollItemData | undefined;

  @Input() hasVoted = false;
  @Input() showCreator = false;
  @Input() draggable = false;

  @Input() removable = false;
  @Input() voteable = false;
  @Input() editable = false;
  @Input() creating = false;
  @Input() reactable = true;
  @Input() pollMovies: number[] = [];
  @Input() useSeenReaction = true;
  @Input() condensedView = false;
  @Input() useBackdropTheme = false;
  @Input() orderNumber: number | false = false;
  @Input() locked = false;
  @Input() isPollOwner = false;
  @Input() hideWatchedMovies = false;
  @Input() selectedVoters: PollItemVoter[] = [];
  // Pre-resolved by the parent (poll.component.ts batches every voter and
  // creator across the whole poll into one UserIdentityService.resolve$()
  // call) — this component doesn't resolve identities itself.
  @Input() voterIdentities: readonly ResolvedIdentity[] = [];
  @Input() creatorIdentity: ResolvedIdentity | undefined;

  @Input() pointVoting = false;
  @Input() budgetRemaining = 0;
  @Input() maxPerItem?: number;
  @Input() myPoints = 0;

  // Private, viewer-only "already watched on Letterboxd" status — see
  // poll.component.ts's letterboxdSeenMap$.
  @Input() letterboxdSeen?: LetterboxdSeenInfo;

  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  @Output() reaction = new EventEmitter<string>();
  @Output() setDescription = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie | Movie>();
  @Output() openAddNewItems = new EventEmitter<{}>();
  @Output() pointChange = new EventEmitter<{ pollItem: PollItem; delta: 1 | -1 }>();

  @Output() toggleSelected = new EventEmitter<boolean>();
  @Output() toggleVisible = new EventEmitter<boolean>();

  pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);

  get pollItem() {
    return this.pollItem$.getValue();
  }

  // Matches the [max] this.voterIdentities is capped at on <avatar-stack>
  // below — kept as one property so the template binding and this
  // component's own width math can't drift apart from each other.
  readonly voterStackMax = 4;

  // .controls (movie-poll-item.component.scss) has no way to size itself to
  // fit <avatar-stack> on its own — a flex item shrink-fitting a column of
  // block children empirically locks onto <voter>'s own width and ignores
  // its sibling's real footprint, so without this the stack silently
  // overflowed the column and, past it, the card's own edge. Computed from
  // the actual voter count (not <voter>'s size/avatar-stack's own worst
  // case) so a low-vote item doesn't pay for room it isn't using — see
  // .controls's own comment for the rest of this reasoning. The box/overlap
  // numbers mirror voter.component.scss's `width` rules and
  // avatar-stack.component.ts's BOX_SIZE/OVERLAP; duplicated here rather
  // than imported because this is the one place that needs both together.
  get controlsWidthPx(): number {
    const voterWidth = this.condensedView ? 32 : 40;
    const box = this.condensedView ? 16 : 30;
    const overlap = this.condensedView ? 5 : 8;
    const hasOverflow = this.voterIdentities.length > this.voterStackMax;
    const items = hasOverflow ? this.voterStackMax : this.voterIdentities.length;
    const stackWidth = items > 0 ? box + (items - 1) * (box - overlap) : 0;
    return Math.max(voterWidth, stackWidth);
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

  pollItemOwner$: Observable<boolean>;
  reactionClickDisabled$ = new BehaviorSubject<boolean>(true);
  hasOscarAwards$: Observable<'won' | 'nominated' | 'none'>;

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
  canAddPoint = canAddPoint;
  canRemovePoint = canRemovePoint;

  ngOnChanges(changes: SimpleChanges) {
    if (changes.hasVoted) {
      if (this.openMovie) {
        this.openMovie.componentInstance.data.hasVoted =
          changes.hasVoted.currentValue;
      }
    }
  }

  constructor() {
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

    this.pollItemOwner$ = combineLatest([this.pollItem$, user$]).pipe(
      filter(([pollItem]) => pollItem !== undefined),
      distinctUntilChanged(isEqual),
      // Legacy poll items predate the `creator` field, and an anonymous visitor
      // has no `user` at all — both must resolve to "not the owner", not throw.
      map(([pollItem, user]) => !!pollItem.creator?.id && pollItem.creator.id === user?.id),
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

    this.hasOscarAwards$ = this.pollItem$.pipe(
      filter((pollItem) => !!pollItem?.movieId),
      map((pollItem: PollItem) => {
        const movieId = pollItem.movieId;
        const awards = this.movieAwardsService.getOscarAwardsForMovie(movieId);
        const wonAwards = awards.filter(a => a.won).length;
        return wonAwards > 0 ? 'won' : awards.length > 0 ? 'nominated' : 'none';
      })
    );
  }
  
  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  addPoint(pollItem: PollItem): void {
    this.pointChange.emit({ pollItem, delta: 1 });
  }

  removePoint(pollItem: PollItem): void {
    this.pointChange.emit({ pollItem, delta: -1 });
  }

  remove(pollItem: PollItem, pollItemOwner: boolean): void {
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
    this.openMovie = this.movieDialog.openMovie({
      editable: this.editable,
      description: this.pollItem.description,
      pollItem: this.pollItem,
      isVoteable: this.voteable,
      pointVoting: this.pointVoting,
      isReactable: this.reactable,
      movieReactions$: this.movieReactions$,
      hasVoted: this.hasVoted,
      voteCount: filteredVoteCount(this.pollItem, this.selectedVoters, this.pointVoting),
      voters: this.filteredVoters(this.pollItem),
      movieId: this.pollItem.movieId,
      currentMovieOpen: true,
      filterMovies: this.pollMovies,
      movie: moviePollitemData,
      parent: true,
      locked: this.locked
    });

    this.openMovie.afterClosed().subscribe(() => {
      this.openMovie = undefined;
    });

    this.pollItem$
      .pipe(takeUntil(this.openMovie.afterClosed()))
      .subscribe((pollItem) => {
        this.openMovie.componentInstance.data.voteCount =
          filteredVoteCount(pollItem, this.selectedVoters, this.pointVoting);
        this.openMovie.componentInstance.data.voters =
          this.filteredVoters(pollItem);
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

  clickToggleSelected(pollItem: PollItem) {
    const snack = this.snackbar.open(!pollItem.selected ? `Do you want to mark '${pollItem.name}' selected? 👑` : `Unselect '${pollItem.name}'?`, !pollItem.selected ? 'Select' : 'Unselect');
      snack.onAction().pipe(takeUntil(snack.afterDismissed())).subscribe(() => {
        this.toggleSelected.emit(!pollItem.selected);
      })
  }

  clickToggleVisibile(pollItem) {
    const snack = this.snackbar.open(pollItem.visible === false ? `Do you want show '${pollItem.name}'?` : `Do you want to hide '${pollItem.name}' from voting? 👻`, pollItem.visible === false ? 'Show' : 'Hide');
    snack.onAction().pipe(takeUntil(snack.afterDismissed())).subscribe(() => {
      this.toggleVisible.emit(pollItem.visible === false ? true : false);
    })
  }

  openAddItems() {
    this.openAddNewItems.emit();
  }

  // Same filtering the voter-filter feature already applies everywhere else
  // (VoterComponent's badge, the poll-stats totals, sorting) — kept here too so the
  // movie dialog's "Voters (N): ..." line doesn't silently ignore a selected voter
  // filter or, once ranked point voting is on, still count/list unfiltered raw
  // voters instead of the filtered, point-weighted total.
  private filteredVoters(pollItem: PollItem): PollItem["voters"] {
    if (!this.selectedVoters?.length) {
      return pollItem.voters;
    }
    return pollItem.voters.filter((voter) => {
      const key = voterKey(voter);
      return this.selectedVoters.some(
        (selected) => selected.selected && voterKey(selected) === key
      );
    });
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
