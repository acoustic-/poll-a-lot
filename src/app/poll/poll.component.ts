import { Component, OnDestroy, ChangeDetectionStrategy, afterNextRender, afterRenderEffect, Pipe, AfterViewInit, Injector, runInInjectionContext, viewChild, ElementRef, inject, PipeTransform } from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { Observable, BehaviorSubject, NEVER, from, combineLatest, of, firstValueFrom } from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";

import { Poll, PollItem, PollSuggestion } from "../../model/poll";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { UntypedFormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { Movie, TMDbMovie, TMDbSeries } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { PollOptionDialogComponent } from "../poll-option-dialog/poll-option-dialog.component";
import {
  switchMap,
  tap,
  debounceTime,
  filter,
  distinctUntilChanged,
  first,
  map,
  catchError,
  shareReplay,
  auditTime,
  pairwise,
  startWith,
} from "rxjs/operators";
import { PollItemService, canAddPoint, canRemovePoint, DEFAULT_POINT_VOTING_BUDGET } from "../poll-item.service";
import { AddMovieDialog } from "../movie-poll-item/add-movie-dialog/add-movie-dialog";
import { User } from "../../model/user";
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  updateDoc,
} from "@angular/fire/firestore";
import { defaultDialogHeight, defaultDialogOptions } from "../common";
import { EditPollDialogComponent } from "./edit-poll-dialog/edit-poll-dialog.component";
import { ConfirmDialogComponent, ConfirmDialogData } from "../confirm-dialog/confirm-dialog.component";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { CdkDragDrop, moveItemInArray, CdkDropList, CdkDrag } from "@angular/cdk/drag-drop";
import { getPollMovies, SEEN } from "../movie-poll-item/movie-helpers";
import _IsEqual from "lodash.isequal";
import { GeminiService } from "../gemini.service";
import {
  PollDescriptionSheet,
  PollDescriptionData,
} from "./poll-description-dialog/poll-description-dialog";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { isDefined, joinWithAnd } from "../helpers";
import { toUserRef, UserRef, voterKey } from "../user-identity";
import { UserIdentityService, ResolvedIdentity } from "../user-identity.service";
import { LetterboxdService } from "../letterboxd.service";
import { LetterboxdSeenInfo } from "../../model/letterboxd";
import { PollItemVoter, filteredVoteCount } from "./poll-voters";
import { MatCard } from "@angular/material/card";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { MatTooltip } from "@angular/material/tooltip";
import { GaugeRingComponent } from "../gauge-ring/gauge-ring.component";
import { MatIconButton, MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatMenuTrigger, MatMenu, MatMenuItem } from "@angular/material/menu";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { AvatarStackComponent } from "../avatar-stack/avatar-stack.component";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatDivider } from "@angular/material/divider";
import { ButtonGradientComponent } from "../shared/button-gradient/button-gradient.component";
import { MatFormField, MatLabel, MatInput } from "@angular/material/input";
import { MatSelect } from "@angular/material/select";
import { MatOption, MatAutocompleteTrigger, MatAutocomplete } from "@angular/material/autocomplete";
import { VoterComponent } from "../voter/voter.component";
import { PointVoteStepperComponent } from "../voter/point-vote-stepper/point-vote-stepper.component";
import { MoviePollItemComponent } from "../movie-poll-item/movie-poll-item.component";
import { PosterComponent } from "../poster/poster.component";
import { SeriesPollItemComponent } from "../series-poll-item/series-poll-item.component";
import { MovieSearchInputComponent } from "../movie-search-input/movie-search-input.component";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { PointVotingBarComponent } from "./point-voting-bar/point-voting-bar.component";
import { NgTemplateOutlet, AsyncPipe, DatePipe, I18nPluralPipe } from "@angular/common";
import { FirestoreDatePipe } from "../firestore-date.pipe";
import { SortPipe } from "../poll-item-sort.pipe";
import { DuelService } from "./ranked-duels/duel.service";
import { DuelVotingBarComponent } from "./ranked-duels/duel-voting-bar/duel-voting-bar.component";
import { DuelViewComponent, DuelViewData } from "./ranked-duels/duel-view/duel-view.component";
import { defaultTargetDuels, duelWinPercent, rankFromDuels, RankedItem, RankingMethod, PairStrategy } from "./ranked-duels/rank-from-duels";
import { DuelBallot, DuelProgress, flattenBallots, duelProgress } from "../../model/duel";
import { duelCtaState, DuelCtaKind, DuelCtaState, hasFinishedDuelRun } from "./ranked-duels/duel-cta";

// A duel-mode card shows a faded, "provisional" rank numeral until the item
// has at least this many comparisons behind it (Checkpoint 2 — sparse-data
// display). ~2 duels arrive from the connectivity-seed phase alone.
const PROVISIONAL_DUELS_MIN = 3;

// Split rather than a single formatted string so the template can hide the
// "3287 minutes ~ " part on narrow poll cards (via a container query on
// .duration-extra) while still showing it in full wherever there's room —
// see .poll-stats-chips in poll.component.scss.
export interface DurationBreakdown {
  label: 'Selected' | 'Duration';
  totalMinutes: number;
  hm: string;
}

@Pipe({
  name: "totalDuration",
  pure: true,
  standalone: true
})
export class TotalDurationPipe implements PipeTransform {
  transform(pollItems: PollItem[], useSeenReactions: boolean): DurationBreakdown {
    if (!pollItems) return { label: 'Duration', totalMinutes: 0, hm: '0m' };
    const selectedMovies = pollItems.filter(item => item.selected);
    const visibleDuration = () => pollItems
      .filter(item => (useSeenReactions ? !(item.reactions?.some(r => r.label === SEEN && r.users.length > 0)) : true))
      .filter(item => item.visible !== false)
      .map(item => item.moviePollItemData?.runtime || 0)
      .reduce((sum, duration) => sum + duration, 0);
    const selectedDuration = () => selectedMovies
      .map(item => item.moviePollItemData?.runtime || 0)
      .reduce((sum, duration) => sum + duration, 0);
    const duration = selectedDuration() > 0 ? selectedDuration() : visibleDuration();
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    // Whichever unit is 0 is omitted rather than printed as "0h"/"0m".
    const hm = [hours > 0 ? `${hours}h` : null, (minutes > 0 || hours === 0) ? `${minutes}m` : null]
      .filter(Boolean)
      .join(' ');
    return { label: selectedMovies.length ? 'Selected' : 'Duration', totalMinutes: duration, hm };
  }
}

@Pipe({
  name: "totalVotes",
  pure: true,
  standalone: true
})
export class TotalVotesPipe implements PipeTransform {
  transform(pollItems: PollItem[], selectedVoters?: PollItemVoter[], pointVoting = false): number {
    if (!pollItems) return 0;
    return pollItems
      .map(item => filteredVoteCount(item, selectedVoters, pointVoting))
      .reduce((sum, votes) => sum + votes, 0);
  }
}

@Pipe({
  name: "totalPollItems",
  pure: true,
  standalone: true
})
export class TotalPollItemsPipe implements PipeTransform {
  transform(pollItems: PollItem[] = [], useSeenReactions: boolean): number {
    return pollItems
      .filter(isDefined)
      .filter(item => (useSeenReactions ? !(item.reactions?.some(r => r.label === SEEN && r.users.length > 0)) : true))
      .filter(item => item.visible !== false)
      .length;
  }
}

// Pure pipe wrapper around getPollMovies so it only recomputes when the pollItems
// reference actually changes, instead of on every change-detection pass — the
// template previously called getPollMovies(pollItems) directly inside the @for
// loop that renders one <movie-poll-item> per item, which was O(N) work invoked
// N times per CD run, and handed each child a new array reference every time,
// defeating its OnPush check regardless of pollItem's own isEqual guard.
@Pipe({
  name: "pollMovies",
  pure: true,
  standalone: true
})
export class PollMoviesPipe implements PipeTransform {
  transform(pollItems: PollItem[]): number[] {
    return getPollMovies(pollItems);
  }
}

// Pure pipe so this only recomputes when voters/identities actually change — the
// template previously called a resolveVoters() method directly in a @let, which
// allocated a fresh array every change-detection pass and defeated avatar-stack's
// OnPush check, matching the same problem PollMoviesPipe above solves.
@Pipe({
  name: "resolveVoters",
  pure: true,
  standalone: true
})
export class ResolveVotersPipe implements PipeTransform {
  transform(
    voters: PollItemVoter[] | undefined,
    identities: Map<string, ResolvedIdentity> | undefined
  ): ResolvedIdentity[] {
    if (!voters?.length || !identities) return [];
    return voters
      .map(v => identities.get(voterKey(v)))
      .filter((id): id is ResolvedIdentity => !!id);
  }
}

@Component({
    selector: "app-poll",
    templateUrl: "./poll.component.html",
    styleUrls: ["./poll.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatCard, UserAvatarComponent, MatTooltip, GaugeRingComponent, MatIconButton, MatIcon, MatMenuTrigger, MatMenu, MatMenuItem, MatSlideToggle, FormsModule, AvatarStackComponent, MatCheckbox, MatDivider, ButtonGradientComponent, MatFormField, MatLabel, MatSelect, MatOption, CdkDropList, VoterComponent, PointVoteStepperComponent, MoviePollItemComponent, PosterComponent, CdkDrag, SeriesPollItemComponent, MovieSearchInputComponent, MatInput, MatAutocompleteTrigger, ReactiveFormsModule, MatAutocomplete, MatButton, LazyLoadImageModule, PointVotingBarComponent, DuelVotingBarComponent, NgTemplateOutlet, AsyncPipe, DatePipe, I18nPluralPipe, FirestoreDatePipe, PollMoviesPipe, TotalDurationPipe, TotalVotesPipe, TotalPollItemsPipe, ResolveVotersPipe, SortPipe]
})
export class PollComponent implements AfterViewInit, OnDestroy {
  userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private meta = inject(Meta);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private bottomsheet = inject(MatBottomSheet);
  private tmdbService = inject(TMDbService);
  private firestore = inject(Firestore);
  private gemini = inject(GeminiService);
  pollItemService = inject(PollItemService);
  private analytics = inject(Analytics);
  private injector = inject(Injector);
  private userIdentityService = inject(UserIdentityService);
  private letterboxdService = inject(LetterboxdService);
  private duelService = inject(DuelService);

  pollId$: Observable<string | undefined>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<PollItem[]>;
  user$ = new BehaviorSubject<User | undefined>(undefined);
  addingItem$ = new BehaviorSubject<boolean>(false);
  watchedMoviesCount$: Observable<number>;
  hasSelectedMovies$: Observable<boolean>;

  favorite$: Observable<boolean>;
  myPointsUsed$: Observable<number>;

  // Ranked Duels (mode-gated: these emit an empty ballot list / empty ranking
  // for every non-duel poll, so nothing here changes behaviour elsewhere).
  duelBallots$: Observable<DuelBallot[]>;
  duelRanking$: Observable<RankedItem[]>;
  duelRankMap$: Observable<Map<string, number>>;
  duelStandingMap$: Observable<Map<string, { rank: number; winPercent: number; matchups: number; rated: boolean; provisional: boolean }>>;
  myDuelProgress$: Observable<DuelProgress | null>;
  duelCta$: Observable<DuelCtaState | null>;
  pointVotingParticipants$: Observable<string>;
  pointVotingParticipantIdentities$: Observable<ResolvedIdentity[]>;
  // One batched resolve$() call for every voter AND creator across the whole
  // poll, not one per item — see UserIdentityService.resolve$'s chunked `in`
  // query design.
  allVoterIdentities$: Observable<Map<string, ResolvedIdentity>>;
  itemIdentities$: Observable<Map<string, { voters: ResolvedIdentity[]; creator?: ResolvedIdentity }>>;
  ownerIdentity$: Observable<ResolvedIdentity | null>;
  // Private, viewer-only "already seen on Letterboxd" lookup, keyed by TMDB
  // id. Own account only, and never written back to Firestore or shown to
  // other voters — deliberately distinct from the manual, shared SEEN
  // reaction other voters can see.
  letterboxdSeenMap$: Observable<Map<number, LetterboxdSeenInfo>>;
  // Client-side reduction over letterboxdSeenMap$ — how many of this poll's
  // distinct films the viewer has already seen on Letterboxd, vs. how many
  // are tracked at all. null (not {seen: 0, total: 0}) when there's nothing
  // to show, so the template can gate the ring on it directly. Same
  // private/viewer-only scope as letterboxdSeenMap$; no new callable.
  letterboxdSeenProgress$: Observable<{ seen: number; total: number } | null>;

  seriesControl: UntypedFormControl;
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  newPollItemName = "";

  useCondensedMovieView = false;
  useBackdropTheme = false;
  hideWatchedMovies = false;
  showLetterboxdSeenRing = true;
  draggable = false;

  hasVoted = this.pollItemService.hasVoted;
  canAddPoint = canAddPoint;
  canRemovePoint = canRemovePoint;
  defaultPointVotingBudget = DEFAULT_POINT_VOTING_BUDGET;

  voterFilter$ = new BehaviorSubject<PollItemVoter | undefined>(undefined);

  subs = NEVER.subscribe();

  readonly descriptionExpanded$ = new BehaviorSubject(false);
  readonly descriptionOverflows$ = new BehaviorSubject(false);

  // viewChild(), not @ViewChild: the queried element only exists once
  // `poll.description` arrives (async, behind an @if), and re-querying it
  // reactively via the effect below is what lets the ResizeObserver setup react
  // correctly to it appearing — the classic @ViewChild + ngAfterViewChecked
  // alternative would re-check on every CD cycle instead. Kept purely internal to
  // this measurement; the template never reads it.
  private readonly descriptionEl = viewChild<ElementRef<HTMLElement>>("descriptionEl");
  private descriptionResizeObserver?: ResizeObserver;

  private pollCollection;
  private previousSuggestions: PollSuggestion[] | undefined;

  sortType$ = new BehaviorSubject<
    | "smart"
    | "regular"
    | "score-desc"
    | "score-asc"
    | "title"
    | "release-desc"
    | "release-asc"
    | "ranked"
    | "duelrank"
  >("smart");

  pluralMapping: Record<string, string> = {
    '=0': 's',
    '=1': '',
    'other': 's',
  };

  get user() {
    return this.user$.getValue();
  }

  constructor() {
    this.pollCollection = collection(this.firestore, "polls");

    this.meta.addTag({
      name: "description",
      content:
        "Poll creation made easy. Instant. Mobile. Share the way you want!",
    });

    this.pollId$ = this.route.paramMap.pipe(
      map((params: ParamMap) => params.get("id")),
      distinctUntilChanged()
    );

    this.poll$ = this.pollId$
    .pipe(
      switchMap((pollId) => {
        // doc() and docData() both need an active Angular injection context
        // (an AngularFire dev-mode warning otherwise) but this switchMap
        // callback runs later, well after the constructor's own context
        // has closed.
        return runInInjectionContext(this.injector, () =>
          docData(doc(this.pollCollection, pollId), { idField: "id" })
        ).pipe(
          tap((poll: Poll) => {
            if (!poll) {
              console.error("Poll not found:", pollId);
              this.handleMissingPoll(pollId);
              return;
            }
            // Set current poll as recent poll
            this.userService.setRecentPoll(poll);

            // Set sort type
            if (poll.duelVoting?.duels) {
              this.sortType$.next("duelrank");
            } else if (poll.useSeenReaction === false) {
              this.sortType$.next("regular");
            } else if (poll.movieList || poll.rankedMovieList) {
              this.sortType$.next("ranked");
            }
          }),
          // Firestore errors (e.g. permission-denied — App Check is intentionally
          // skipped during SSR, see app.config.ts) must be caught here, inside the
          // switchMap, rather than left to propagate: an uncaught error on this
          // stream doesn't just fail this one request, it terminates the Observable
          // entirely and crashes the whole SSR Node process with an unhandled
          // rejection. Falling back to `undefined` reuses the existing "poll not
          // found" loading-skeleton branch in the template instead.
          catchError((error) => {
            console.error("Failed to load poll:", pollId, error);
            return of(undefined as Poll | undefined);
          })
        );
      }),
      distinctUntilChanged(_IsEqual)
    )
    .pipe(
      // TODO: Remove this when there are no longer "old" poll
      tap((poll) => this.checkPollCompability(poll)),
      // Several independent streams (allVoterIdentities$, itemIdentities$, the
      // Ranked Duels config gate, …) and several `| async` template bindings
      // all subscribe to this poll — shareReplay so they run the one
      // docData() listener between them (and the tap side effects above fire
      // once per poll load, not once per subscriber) instead of each opening
      // its own.
      shareReplay({ bufferSize: 1, refCount: true })
    );

  this.pollItems$ = this.pollId$.pipe(
    switchMap(
      (pollId) =>
        // Same injection-context requirement as docData() above.
        (runInInjectionContext(this.injector, () =>
          collectionData(
            collection(this.firestore, `polls/${pollId}/pollItems`),
            { idField: "id" }
          )
        ) as Observable<PollItem[]>).pipe(
          catchError((error) => {
            console.error("Failed to load poll items:", pollId, error);
            return of([] as PollItem[]);
          })
        )
    ),
    // distinctUntilChanged(_IsEqual),
    distinctUntilChanged(
      (a, b) =>
        JSON.stringify(a).split("").sort().join("") ===
        JSON.stringify(b).split("").sort().join("")
    ),
    // Same reasoning as poll$ above — this is the one collectionData()
    // listener every consumer (cards, Ranked Duels, voter filter, …) shares.
    shareReplay({ bufferSize: 1, refCount: true })
  );


  this.hasSelectedMovies$ = this.pollItems$.pipe(map(items => items.some(i => i.selected)));

  this.watchedMoviesCount$ = this.pollItems$.pipe(
    map((pollItems) =>
      pollItems.reduce(
        (total, current) =>
          current.reactions?.some(
            (r) => r.label === SEEN && r.users.length > 0
          )
            ? total + 1
            : total,
        0
      )
    )
  );

  this.favorite$ = this.poll$.pipe(
    switchMap((poll) =>
      this.userService.favoritePolls$.pipe(
        map((favorites) =>
          favorites.some((favorite) => favorite.id === poll.id)
        )
      )
    )
  );

  this.myPointsUsed$ = combineLatest([this.pollItems$, this.user$]).pipe(
    map(([pollItems, user]) => this.pollItemService.getUsedBudget(pollItems, user))
  );

  // Everyone who's actually spent ≥1 point somewhere in the poll. Sums each
  // voter's points across every item (legacy binary entries with no `points`
  // field count as 0 here, same as getUserPoints/the stepper's own starting
  // point) rather than reusing hasVoted-style membership, so someone who reset
  // their points back to 0 drops off this list — "participated in ranked point
  // voting" means currently having points allocated, not merely holding a stale
  // voters[] entry from before.
  const pointVotingSpenders$ = this.pollItems$.pipe(
    map(pollItems => {
      const totals = new Map<string, { ref: UserRef; points: number }>();
      pollItems.forEach(item => {
        item.voters?.forEach(voter => {
          const key = voterKey(voter);
          const existing = totals.get(key);
          totals.set(key, { ref: voter, points: (existing?.points ?? 0) + (voter.points ?? 0) });
        });
      });
      return Array.from(totals.values()).filter(v => v.points > 0);
    })
  );

  // Single mode gate for the whole Ranked Duels pipeline: the poll's duel config
  // for a duel poll, null otherwise. shareReplay'd so the feature adds exactly
  // ONE extra subscription to the (un-shared) poll$ — and a normal poll never
  // opens the duelBallots listener or runs rankFromDuels at all.
  const duelConfig$ = this.poll$.pipe(
    map(poll =>
      poll?.duelVoting?.duels
        ? {
            pollId: poll.id,
            method: poll.duelVoting.rankingMethod ?? ("bradleyTerry" as RankingMethod),
            strategy: poll.duelVoting.pairStrategy ?? ("infoGain" as PairStrategy),
            // undefined => resolved per item count via defaultTargetDuels(n)
            target: poll.duelVoting.targetDuelsPerVoter,
          }
        : null
    ),
    distinctUntilChanged(_IsEqual),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // Live ballots — one doc per voter. catchError'd INSIDE the switchMap (same
  // reasoning as pollItems$: an uncaught permission-denied during SSR would
  // crash the Node process).
  this.duelBallots$ = duelConfig$.pipe(
    switchMap(cfg =>
      cfg
        ? runInInjectionContext(this.injector, () => this.duelService.ballots$(cfg.pollId)).pipe(
            catchError(error => {
              console.error("Failed to load duel ballots:", cfg.pollId, error);
              return of([] as DuelBallot[]);
            })
          )
        : of([] as DuelBallot[])
    ),
    distinctUntilChanged(_IsEqual),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // combineLatest([config, pollItems, ballots, voterFilter]) so a movie added
  // mid-poll — or a change to the voter filter — re-emits the ranking. auditTime
  // coalesces the burst of writes when a group votes at once;
  // distinctUntilChanged(isEqual) keeps the reference stable for OnPush children.
  this.duelRanking$ = combineLatest([duelConfig$, this.pollItems$, this.duelBallots$, this.voterFilter$]).pipe(
    auditTime(150),
    map(([cfg, pollItems, ballots, voterFilter]) =>
      cfg
        ? rankFromDuels(pollItems.map(item => item.id), flattenBallots(ballots), {
            method: cfg.method,
            voterFilter: this.duelVoterFilterSet(voterFilter),
          })
        : ([] as RankedItem[])
    ),
    distinctUntilChanged(_IsEqual),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // Gated on duelConfig$ so a non-duel poll's always-on `@let duelRankMap`
  // binding is `of(empty map)` and never subscribes duelRanking$ / its
  // combineLatest at all.
  this.duelRankMap$ = duelConfig$.pipe(
    switchMap(cfg => (cfg ? this.duelRanking$ : of([] as RankedItem[]))),
    map(ranking => new Map(ranking.map(r => [r.itemId, r.rank]))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // itemId -> compact standing for the poll-item cards (rank numeral + win bar).
  // Gated like duelRankMap$ so non-duel polls never subscribe duelRanking$.
  // `provisional` = rated, but on so few duels the rank is still soft — the
  // card shows a faded numeral rather than a confident one (Checkpoint 2).
  this.duelStandingMap$ = duelConfig$.pipe(
    switchMap(cfg =>
      cfg ? this.duelRanking$.pipe(map(ranking => ({ method: cfg.method, ranking }))) : of({ method: null, ranking: [] as RankedItem[] })
    ),
    map(({ method, ranking }) =>
      new Map(
        ranking.map(r => [
          r.itemId,
          {
            rank: r.rank,
            winPercent: duelWinPercent(r, method),
            matchups: r.matchups,
            rated: r.rated,
            provisional: r.rated && r.matchups < PROVISIONAL_DUELS_MIN,
          },
        ])
      )
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // The viewer's own done/budget — never anyone else's, and never a roster count.
  this.myDuelProgress$ = combineLatest([duelConfig$, this.pollItems$, this.duelBallots$, this.user$]).pipe(
    map(([cfg, pollItems, ballots, user]) => {
      if (!cfg) return null;
      const ids = pollItems.map(item => item.id);
      const mine = ballots.find(b => b.id === voterKey(toUserRef(user)));
      return duelProgress(ids, mine?.picks ?? [], cfg.target ?? defaultTargetDuels(ids.length));
    })
  );

  // Which floating bar to show ("Start duelling" / "6 of your 32" / "Top looks
  // solid" / "2 new films"). All from the viewer's own ballot. `done >= total`
  // (budget) IS the "your run is done" signal — same point nextPair stops.
  this.duelCta$ = combineLatest([duelConfig$, this.pollItems$, this.duelBallots$, this.user$]).pipe(
    map(([cfg, pollItems, ballots, user]) => {
      if (!cfg) return null;
      const ids = pollItems.map(item => item.id);
      const key = voterKey(toUserRef(user));
      const picks = ballots.find(b => b.id === key)?.picks ?? [];
      const budget = cfg.target ?? defaultTargetDuels(ids.length);
      const progress = duelProgress(ids, picks, budget);
      const fullCoverage = duelProgress(ids, picks); // no budget => C(n,2)
      const pairsRemaining = fullCoverage.total - fullCoverage.done;

      const seen = new Set(picks.flatMap(p => [p.aId, p.bId]));
      const seenInPoll = [...seen].filter(id => ids.includes(id));
      const unplaced = ids.filter(id => !seen.has(id)).length;
      // Every pair among the movies this voter has actually dueled is done — so
      // any gap is purely newly-added movies (drives the nudge).
      const placedComplete =
        seenInPoll.length >= 2 &&
        fullCoverage.done === (seenInPoll.length * (seenInPoll.length - 1)) / 2;

      return duelCtaState(
        progress,
        pairsRemaining,
        unplaced,
        hasFinishedDuelRun(cfg.pollId, key),
        placedComplete
      );
    }),
    distinctUntilChanged(_IsEqual),
  );

  // Every voter AND every item's creator across the whole poll, resolved in one
  // batched call — one Firestore `in` query per poll load, not one per item,
  // and not one per consumer either: pointVotingParticipantIdentities$ and
  // itemIdentities$ below both derive from this same resolved map via plain
  // Map lookups rather than issuing their own resolve$() calls.
  // shareReplay so the two separate `| async` bindings in the template (this
  // stream and pointVotingParticipants$, which used to independently derive
  // from it) share one execution instead of each re-running resolve$() — and
  // so pollItems$ changing (e.g. on every vote) doesn't refetch identities that
  // were already resolved for a still-live subscriber.
  // Duel-ballot voterRefs are folded in too, so a duel-only voter (who has no
  // pollItems[].voters entry) still resolves to a live identity.
  this.allVoterIdentities$ = combineLatest([this.pollItems$, this.duelBallots$]).pipe(
    map(([pollItems, ballots]) => [
      ...pollItems.flatMap(item => item.voters ?? []),
      ...pollItems.map(item => item.creator).filter(isDefined),
      ...ballots.map(ballot => ballot.voterRef).filter(isDefined),
    ]),
    switchMap(refs => (refs.length ? this.userIdentityService.resolve$(refs) : of(new Map()))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.pointVotingParticipantIdentities$ = combineLatest([pointVotingSpenders$, this.allVoterIdentities$]).pipe(
    map(([spenders, identities]) =>
      spenders
        .map(s => identities.get(voterKey(s.ref)))
        .filter((identity): identity is ResolvedIdentity => !!identity)
    )
  );

  // "✅ Voted: Timothy, John and Reynold." — derived from the same resolved
  // identities as the avatar stack above it, not the frozen vote snapshot, so a
  // display-name change shows up here too (see toUserRef's whole reason for
  // being: presentation must be able to update after the fact).
  this.pointVotingParticipants$ = this.pointVotingParticipantIdentities$.pipe(
    map(identities => joinWithAnd(identities.map(i => i.displayName)))
  );

  // Precomputed per-item {voters, creator} identity lists with STABLE array
  // references between emissions (Map.get() doesn't allocate) — calling
  // resolveIdentities()/a creator lookup directly from a template binding
  // would return a fresh array every change-detection cycle and defeat OnPush
  // on every poll-item child (movie items in particular are expensive to
  // re-render: posters, reactions, providers, awards).
  this.itemIdentities$ = combineLatest([this.pollItems$, this.allVoterIdentities$, this.poll$]).pipe(
    map(([pollItems, identities, poll]) => {
      const map = new Map<string, { voters: ResolvedIdentity[]; creator?: ResolvedIdentity }>();
      pollItems.forEach(item => {
        map.set(item.id, {
          voters: this.resolveIdentities(item.voters, identities, poll?.pointVoting?.pointVoting),
          creator: item.creator ? identities.get(voterKey(item.creator)) : undefined,
        });
      });
      return map;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.letterboxdSeenMap$ = combineLatest([this.pollItems$, this.userService.letterboxdMember$]).pipe(
    switchMap(([pollItems, member]) => {
      if (!member) {
        return of(new Map<number, LetterboxdSeenInfo>());
      }
      const tmdbIds = this.pollItemTmdbIds(pollItems);
      return this.letterboxdService.getRelationships(member.lid, tmdbIds).pipe(
        map(record => new Map(Object.entries(record).map(([id, info]) => [Number(id), info])))
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.letterboxdSeenProgress$ = combineLatest([
    this.pollItems$,
    this.letterboxdSeenMap$,
    this.userService.letterboxdMember$,
  ]).pipe(
    map(([pollItems, seenMap, member]) => {
      if (!member) {
        return null;
      }
      const tmdbIds = this.pollItemTmdbIds(pollItems);
      if (tmdbIds.length === 0) {
        return null;
      }
      const seen = tmdbIds.filter(id => seenMap.get(id)?.watched).length;
      return { seen, total: tmdbIds.length };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.ownerIdentity$ = this.poll$.pipe(
    map(poll => poll?.owner ? [poll.owner] : [] as UserRef[]),
    switchMap(refs => refs.length
      ? this.userIdentityService.resolve$(refs)
      : of(new Map<string, ResolvedIdentity>())
    ),
    map(resolvedMap => [...resolvedMap.values()][0] ?? null),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.subs.add(
    combineLatest([
      this.pollItems$,
      // startWith so the filter is built on the first pollItems$ emit rather
      // than waiting for the (slower) ballot stream — ballot voters fold in
      // when they arrive.
      this.duelBallots$.pipe(startWith([] as DuelBallot[])),
    ]).pipe(
      map(([pollItems, ballots]) =>
        this.buildVoterFilter(
          pollItems,
          this.voterFilter$.value,
          ballots.map(b => b.voterRef).filter(isDefined)
        )
      )
    ).subscribe(voters => this.voterFilter$.next(voters))
  );

  // Toast when a movie is added to a duel poll while someone has it open — the
  // ranking re-emits on its own; this just tells the viewer why it shifted.
  this.subs.add(
    combineLatest([duelConfig$, this.pollItems$]).pipe(
      map(([cfg, pollItems]) => (cfg ? new Set(pollItems.map(i => i.id)) : null)),
      pairwise()
    ).subscribe(([prev, curr]) => {
      if (!prev || !curr) return;
      const added = [...curr].filter(id => !prev.has(id)).length;
      if (added > 0) {
        this.snackBar.open(
          added === 1 ? "A new movie joined the duel" : `${added} new movies joined the duel`,
          undefined,
          { duration: 4000 }
        );
      }
    })
  );

    // Re-queries #descriptionEl whenever it appears/disappears (poll.description
    // arrives async, behind an @if) and keeps its overflow measurement current via
    // ResizeObserver. Browser-only and re-runs only on element-identity change, not
    // on every render — see the field comment above for why this needs to be a
    // signal-driven effect rather than @ViewChild + ngAfterViewChecked.
    afterRenderEffect(() => {
      const el = this.descriptionEl()?.nativeElement;
      this.descriptionResizeObserver?.disconnect();
      this.descriptionResizeObserver = undefined;
      if (!el) {
        this.descriptionOverflows$.next(false);
        return;
      }
      const measure = () => {
        // Only while clamped: once expanded, scrollHeight === clientHeight and a
        // naive re-measure here would incorrectly hide the "Show less" button.
        if (!this.descriptionExpanded$.getValue()) {
          this.descriptionOverflows$.next(el.scrollHeight > el.clientHeight + 1);
        }
      };
      measure();
      this.descriptionResizeObserver = new ResizeObserver(measure);
      this.descriptionResizeObserver.observe(el);
    });

    afterNextRender(() => {
      this.meta.addTag({ name: "og:title", content: "Poll-A-Lot" });
      this.meta.addTag({ name: "title", content: "Poll-A-Lot" });
      this.meta.addTag({ name: "og:url", content: window.location.href });
      this.meta.addTag({
        name: "og:description",
        content: "Poll creation made easy.",
      });
      this.meta.addTag({
        name: "og:image",
        content:
          location.hostname +
          "/assets/img/poll-a-lot-" +
          Math.floor(Math.random() * 7 + 1) +
          ".png",
      });
      this.meta.addTag({ name: "og:type", content: "webpage" });

      this.useBackdropTheme = JSON.parse(localStorage?.getItem("backdrop_theme")) || false;

      this.useCondensedMovieView =
        JSON.parse(localStorage?.getItem("condensed_poll_view")) || false;

      this.hideWatchedMovies =
        JSON.parse(localStorage?.getItem("hide_watched_movied_poll_view")) ||
        false;

      this.subs.add(
        this.seriesControl.valueChanges
          .pipe(
            debounceTime(700),
            distinctUntilChanged(),
            switchMap((searchString) =>
              searchString?.length > 0
                ? this.tmdbService.searchSeries(searchString)
                : []
            )
          )
          .subscribe((results) => this.seriesSearchResults$.next(results))
      );

    });


    // this.poll$
    // .pipe(first())
    // .subscribe((poll) =>
    //   logEvent(this.analytics, "poll_loaded", {
    //     type: poll.moviepoll
    //       ? "movie"
    //       : poll.seriesPoll
    //         ? "series"
    //         : "general",
    //     pollId: poll.id,
    //   })
    // );

    this.subs.add(
      this.userService.user$.subscribe((user) => this.user$.next(user))
    );

    // Apply stored preferences from UserData when Firestore data arrives, so a
    // preference changed in Settings takes effect without a full page reload.
    // The localStorage fast-path in afterNextRender() still sets the initial
    // value before Firestore responds; this subscription upgrades it when ready.
    this.subs.add(
      this.userService.userData$.pipe(
        filter(Boolean),
        map(userData => userData.preferences ?? {}),
        distinctUntilChanged(_IsEqual),
      ).subscribe(prefs => {
        if (prefs.condensedMovieView !== undefined) this.useCondensedMovieView = prefs.condensedMovieView;
        if (prefs.hideWatchedMovies !== undefined) this.hideWatchedMovies = prefs.hideWatchedMovies;
        if (prefs.useBackdropTheme !== undefined) this.useBackdropTheme = prefs.useBackdropTheme;
        if (prefs.letterboxdShowSeenRing !== undefined) this.showLetterboxdSeenRing = prefs.letterboxdShowSeenRing;
      })
    );

    this.seriesControl = new UntypedFormControl();
  }

  ngAfterViewInit() {
    // Clear params from route
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        movieId: null,
        person: null,
      },
      queryParamsHandling: "merge",
    });
  }

  async pollItemClick(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }

    logEvent(this.analytics, "pollitem_vote", {
      type: poll.moviepoll ? "movie" : poll.seriesPoll ? "series" : "general",
      pollId: poll.id,
      pollItem: pollItem.id,
    });

    await this.pollItemService.vote(
      poll.id,
      pollItem,
      pollItems,
      poll.selectMultiple
    );
  }

  async pointVoteClick(
    poll: Poll,
    pollItems: PollItem[],
    event: { pollItem: PollItem; delta: 1 | -1 }
  ) {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }

    await this.pollItemService.allocatePoint(
      poll.id,
      event.pollItem,
      pollItems,
      poll.pointVoting?.pointVotingBudget ?? DEFAULT_POINT_VOTING_BUDGET,
      poll.pointVoting?.pointVotingMaxPerItem,
      event.delta
    );
  }

  async resetMyPoints(poll: Poll, pollItems: PollItem[]) {
    await this.pollItemService.resetMyPoints(poll.id, pollItems, this.user);
  }

  // The duel bar's button: "Redo" (a finished run) wipes just this voter's
  // ballot after a confirm; "Keep going" (sharpen) re-opens with the budget
  // lifted; everything else resumes/starts the run.
  async onDuelCta(poll: Poll, kind: DuelCtaKind): Promise<void> {
    if (kind === "done") {
      const key = voterKey(toUserRef(this.user));
      if (
        key &&
        (await this.confirm({
          title: "Redo your duels?",
          message: "This clears your own picks for this poll and starts a fresh run. Other voters aren't affected.",
          confirmLabel: "Redo my duels",
          confirmColor: "warn",
        }))
      ) {
        await this.duelService.resetMyDuels(poll.id, key);
      } else {
        return;
      }
    }
    this.startDuels(poll, { uncapped: kind === "sharpen" });
  }

  // Opens the fullscreen VS dialog. Browser-only by construction (it only ever
  // opens on a tap), so SSR never instantiates DuelViewComponent. The dialog
  // reads live poll items + ranking straight off this component's streams.
  // `uncapped` lifts the per-voter budget for a "keep going to sharpen" session.
  startDuels(poll: Poll, opts: { uncapped?: boolean } = {}): void {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }
    this.dialog.open<DuelViewComponent, DuelViewData>(DuelViewComponent, {
      width: "96vw",
      maxWidth: "440px",
      // Same tall footprint as the movie dialog — the arena fills it (the two
      // bands are `flex: 1`), so the extra height goes to the movie cards.
      height: defaultDialogHeight,
      maxHeight: "94vh",
      panelClass: "duel-view-panel",
      autoFocus: false,
      restoreFocus: true,
      closeOnNavigation: true,
      data: {
        poll,
        pollItems$: this.pollItems$,
        ranking$: this.duelRanking$,
        allDuels$: this.duelBallots$.pipe(map(flattenBallots)),
        letterboxdSeen$: this.letterboxdSeenMap$,
        uncapped: !!opts.uncapped,
      },
    });
  }

  getBgWidth(pollItems: PollItem[], pollItem: PollItem): string {
    if (pollItem && pollItems) {
      const allVotes = pollItems.reduce((count, current) => {
        return count + current.voters.length;
      }, 0);
      const votes = pollItem.voters.length;
      const percentage = (allVotes > 0 ? votes / allVotes : 0) * 100;
      return `${percentage}`;
    }
  }

  shareClicked(poll: Poll): void {
    this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id: poll.id, name: poll.name, pollDescription: poll.description },
    });
  }

  addNewItems(poll: Poll, pollItems: PollItem[]): void {
    if (
      !this.userService.getUserOrOpenLogin(() => {
        this.addNewItems(poll, pollItems);
      })
    ) {
      return;
    }
    if (poll.moviepoll) {
      const addMovieDialog = this.dialog.open(AddMovieDialog, {
        ...defaultDialogOptions,
        data: {
          pollData: {
            poll,
            pollItems,
          },
          movieIds: pollItems.map((p) => p.movieId),
        },
      });
      addMovieDialog
        .afterClosed()
        .pipe(filter((p) => !!p))
        .subscribe((movie) => this.addMoviePollItem(poll, pollItems, movie));
      return;
    }
    this.newPollItemName = "";
    this.addingItem$.next(true);
  }

  closeAddNewItems(): void {
    this.newPollItemName = "";
    this.addingItem$.next(false);
  }

  addPollItem(poll: Poll, pollItems: PollItem[], name: string): void {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addPollItem(poll, pollItems, name)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.name === name)) {
      this.snackBar.open(
        "This options already exists. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const ref = this.snackBar.open(
        `Are you sure you want to add ${name ? name : "this option"}?`,
        "Add",
        { duration: 5000 }
      );
      ref.onAction().subscribe(() => {
        const newPollItem: Omit<PollItem, "pollId"> = {
          id: this.uniqueId(),
          name: name,
          created: Date.now().toString(),
          voters: [],
          creator: toUserRef(this.userService.getUser()),
          order: pollItems.length,
        };
        this.pollItemService.addPollItemFS(poll.id, newPollItem);
      });
    }
  }

  async addMoviePollItem(
    poll: Poll,
    pollItems: PollItem[],
    movie: TMDbMovie | Movie
  ) {
    if (poll.locked) {
      return;
    }
    (
      await this.pollItemService.addMoviePollItem(
        movie,
        poll.id,
        pollItems.map((pollItem) => pollItem.movieId),
        false,
        true
      )
    )
      .pipe(
        filter((p) => !!p),
        tap(() => this.clearDescriptionAI(poll.id)),
        tap((p) =>
          logEvent(this.analytics, "pollitem_add", {
            type: "movie",
            pollId: poll.id,
            name: p.name,
            movieId: p.movieId,
          })
        )
      )
      .subscribe(() => {
        // this.searchResults$.next([]);
        this.dialog.closeAll();
      });
  }

  addSeriesPollItem(
    poll: Poll,
    pollItems: PollItem[],
    series: TMDbSeries,
    seriesId: number
  ): void {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addSeriesPollItem(poll, pollItems, series, seriesId)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.seriesId === seriesId)) {
      this.snackBar.open(
        "You already have this on the list. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const ref = this.snackBar.open(
        `Are you sure you want to add ${series.original_name ? series.original_name : "this option"
        }?`,
        "Add",
        { duration: 5000 }
      );
      ref.onAction().subscribe(() => {
        const newPollItem: PollItem = {
          id: this.uniqueId(),
          pollId: poll.id,
          name: series.original_name,
          created: Date.now().toString(),
          voters: [],
          seriesId: seriesId,
          creator: toUserRef(this.userService.getUser()),
          order: pollItems.length,
        };
        this.pollItemService.addPollItemFS(poll.id, newPollItem);
        this.closeAddNewItems();
        this.seriesSearchResults$.next([]);
      });
    }
  }

  drawRandom(poll: Poll, pollItems: PollItem[]): void {
    const random = pollItems[Math.floor(Math.random() * pollItems.length)];
    const dialogRef = this.dialog.open(PollOptionDialogComponent, {
      data: random,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.removePollItem(poll, result);
      }
    });
  }

  editPoll(poll: Poll, pollItems: PollItem[]) {
    const bottomSheet = this.bottomsheet.open(EditPollDialogComponent, {
      data: { poll, pollItems }
    });

    bottomSheet
      .afterDismissed()
      .pipe(
        first(),
        filter((poll) => !!poll)
      )
      .subscribe(async (updatedPoll) => {
        await updateDoc(doc(this.pollCollection, poll.id), {
          name: updatedPoll.name,
          description: updatedPoll.description || null,
          date: updatedPoll.date || null,
          allowAdd: updatedPoll.allowAdd || false,
          showPollItemCreators: updatedPoll.showPollItemCreators || false,
          useSeenReaction: updatedPoll.useSeenReaction || false,
          movieList: updatedPoll.movieList || false,
          rankedMovieList: updatedPoll.rankedMovieList || false,
          locked: updatedPoll.locked || null,
          pointVoting: {
            pointVoting: updatedPoll.pointVoting?.pointVoting || false,
            pointVotingBudget: updatedPoll.pointVoting?.pointVotingBudget || null,
            pointVotingMaxPerItem: updatedPoll.pointVoting?.pointVotingMaxPerItem ?? null,
          },
          // Firestore rejects `undefined`, so every optional field is coalesced
          // to `null` (mirrors the pointVoting block above).
          duelVoting: {
            duels: updatedPoll.duelVoting?.duels || false,
            rankingMethod: updatedPoll.duelVoting?.rankingMethod ?? null,
            pairStrategy: updatedPoll.duelVoting?.pairStrategy ?? null,
            targetDuelsPerVoter: updatedPoll.duelVoting?.targetDuelsPerVoter ?? null,
          },
        });
        if (updatedPoll.clearPointVotes) {
          await this.pollItemService.resetAllPointVotes(poll.id, pollItems);
        }
        if (updatedPoll.clearDuels) {
          await this.duelService.resetAllDuels(poll.id);
        }
      });
  }

  // Owner-only, movie polls only (see poll.component.html #pollOptionsMenu). Walks
  // two dialogs: what to clear, then whether the "Seen" reactions go with it.
  async clearVotingStatus(poll: Poll, pollItems: PollItem[]): Promise<void> {
    if (!this.userService.isCurrentUser(poll.owner)) {
      return;
    }

    type ClearMode = "remove" | "zero-points";
    let mode: ClearMode;

    if (poll.pointVoting?.pointVoting) {
      const choice = await this.confirm<ClearMode>({
        title: "Clear voting status",
        message:
          "This affects every voter on this poll and can't be undone.",
        choices: [
          { label: "Remove all votes", value: "remove", color: "warn" },
          { label: "Keep votes, zero points only", value: "zero-points" },
        ],
      });
      if (!choice) {
        return;
      }
      mode = choice;
    } else {
      const confirmed = await this.confirm({
        title: "Clear all votes for everyone?",
        message: "This removes every vote on this poll and can't be undone.",
        confirmLabel: "Clear votes",
        confirmColor: "warn",
      });
      if (!confirmed) {
        return;
      }
      mode = "remove";
    }

    if (mode === "remove") {
      await this.pollItemService.clearAllVotes(poll.id, pollItems);
    } else {
      await this.pollItemService.resetAllPointVotes(poll.id, pollItems);
    }
    logEvent(this.analytics, "pollitem_clear_votes", {
      pollId: poll.id,
      mode,
    });

    if (poll.useSeenReaction) {
      const seenChoice = await this.confirm<"clear" | "leave">({
        title: "Also clear everyone's 'Seen' reactions?",
        message: "The 'Seen' marks on movies are separate from votes.",
        choices: [
          { label: "Leave them", value: "leave" },
          { label: "Clear seen reactions", value: "clear", color: "warn" },
        ],
      });
      if (seenChoice === "clear") {
        await this.pollItemService.clearSeenReactions(poll.id, pollItems);
        logEvent(this.analytics, "pollitem_clear_seen", { pollId: poll.id });
      }
    }

    this.snackBar.open("Voting status cleared", undefined, { duration: 3000 });
  }

  removePollItem(poll: Poll, pollItem: PollItem): void {
    // Reachable via "Pick random" for any item regardless of who created it
    // (unlike the direct remove button, which only shows for the item's own
    // creator) — legacy items with no `creator` recorded, and an anonymous
    // `this.user`, must both fall through to "no attribution", not throw.
    const isPollItemOwner =
      pollItem.creator?.id && pollItem.creator.id !== this.user?.id
        ? `This was added by '${pollItem.creator.name}'.`
        : "";
    const snack = this.snackBar.open(
      `Do you want to remove ${pollItem.name ? pollItem.name : "the chosen option"
      }? ${isPollItemOwner}`,
      "Remove",
      { duration: 5000 }
    );
    from(snack.onAction())
      .pipe(
        tap(() =>
          this.pollItemService
            .removePollItemFS(poll.id, pollItem.id)
            .then(() => {
              this.clearDescriptionAI(poll.id);
              this.snackBar.open("Poll item removed!", undefined, {
                duration: 5000,
              });
            })
        ),
        tap(() =>
          logEvent(this.analytics, "pollitem_remove", {
            type: poll.moviepoll
              ? "movie"
              : poll.seriesPoll
                ? "series"
                : "general",
            pollId: poll.id,
          })
        )
      )
      .subscribe();
  }

  async setDescription(
    pollId: string,
    pollItemId: string,
    description: string
  ) {
    await this.pollItemService.setDescription(pollId, pollItemId, description);
  }

  setBackdropThemeState(value: boolean) {
    this.useBackdropTheme = value;
    localStorage.setItem("backdrop_theme", JSON.stringify(value));
  }

  setCondensedViewState(value: boolean) {
    this.useCondensedMovieView = value;
    localStorage.setItem("condensed_poll_view", JSON.stringify(value));
  }

  setWatchedMoviedViewState(value: boolean) {
    this.hideWatchedMovies = value;
    localStorage.setItem(
      "hide_watched_movied_poll_view",
      JSON.stringify(value)
    );
  }

  drop(event: CdkDragDrop<string[]>, poll: Poll, pollItems: PollItem[]) {
    moveItemInArray(pollItems, event.previousIndex, event.currentIndex);

    pollItems.forEach((pollItem, index) => {
      if (event.currentIndex < event.previousIndex) {
        if (index >= event.currentIndex && index <= event.previousIndex) {
          updateDoc(
            doc(
              collection(this.firestore, `polls/${poll.id}/pollItems`),
              pollItem.id
            ),
            { order: index }
          );
        }
      } else {
        if (index >= event.previousIndex && index <= event.currentIndex) {
          updateDoc(
            doc(
              collection(this.firestore, `polls/${poll.id}/pollItems`),
              pollItem.id
            ),
            { order: index }
          );
        }
      }
    });
  }

  reaction(poll: Poll, pollId: string, pollItem: PollItem, reaction: string) {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }
    logEvent(this.analytics, "pollitem_reaction", {
      type: poll.moviepoll ? "movie" : poll.seriesPoll ? "series" : "general",
      pollId: poll.id,
      pollItem: pollItem.id,
    });
    this.pollItemService.reaction(pollId, pollItem, reaction);
  }

  async descriptionButtonClick(poll: Poll, pollItems: PollItem[]) {
    let description = poll.descriptionAI;
    const selectedMovies = pollItems.some(item => item.selected);
    const bottomSheet = this.bottomsheet.open(PollDescriptionSheet, {
      data: {
        description,
        pollName: poll.name,
        pollId: poll.id,
        pollItems,
        simple: selectedMovies,
        suggestions: this.previousSuggestions,
      } as PollDescriptionData,
    });

    if (!poll.descriptionAI) {
      const filteredPollItems = pollItems
        .filter(
          (pollItem) =>
            !pollItem.reactions?.some(
              (r) => r.label === SEEN && r.users.length > 0
            )
        )
        .filter((pollItem) => pollItem.visible !== false);
      const selectedPollItems = pollItems.filter(item => item.selected);

      description = await this.generateDescriptionAI(poll, filteredPollItems.map(item => item.name), selectedPollItems.map(item => item.name));
      bottomSheet.instance.data.description = description;
    }

    this.bottomsheet._openedBottomSheetRef
      .afterDismissed()
      .subscribe((results) => (this.previousSuggestions = results));
  }

  toggleVisible(pollId: Poll["id"], pollItem: PollItem, visible: boolean) {
    this.clearDescriptionAI(pollId);
    this.pollItemService.toggleVisible(pollId, pollItem, visible);
  }

  toggleSelected(pollId: Poll["id"], pollItem: PollItem, selected: boolean) {
    this.pollItemService.toggleSelected(pollId, pollItem, selected);
    this.clearDescriptionAI(pollId);
  }

  toggleFavorite(poll: Poll) {
    console.log("toggle favorite", poll.name);
    if (!this.userService.getUserOrOpenLogin(() => this.toggleFavorite(poll))) {
      return;
    }
    this.userService.toggleFavoritePoll(poll);
  }

  partiallyComplete$ = this.voterFilter$.pipe(
    map(voters => {
      if (!voters?.voters?.length) {
        return false;
      }
      return voters.voters.some((v: PollItemVoter) => v.selected) && !voters.voters.every((v: PollItemVoter) => v.selected);
    })
  );

  isFiltered$ = this.voterFilter$.pipe(
    map(voters => !!voters?.voters?.length && voters.voters.some(v => !v.selected))
  );

  selectedVoterCount$ = this.voterFilter$.pipe(
    map(voters => voters?.voters?.filter(v => v.selected).length ?? 0)
  );

  update(voter: PollItemVoter, selected: boolean, index?: number) {
    // Build a new `voters` array (and mutated entries) rather than mutating in place —
    // downstream [selectedVoters] bindings dirty-check by reference and would otherwise
    // never see the change.
    const voters = (voter.voters ?? []).map((t, i) =>
      index === undefined || i === index ? { ...t, selected } : t
    );
    this.voterFilter$.next({
      ...voter,
      voters,
      selected: index === undefined ? selected : voters.every(t => t.selected),
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.descriptionResizeObserver?.disconnect();
  }

  // Recomputes the "All Voters" filter entry from the current poll items, carrying over
  // each voter's `selected` state from the previous filter rather than resetting everyone
  // to selected on every `pollItems$` emission (i.e. every vote/point allocation/reaction).
  // A voter seen for the first time defaults to selected, matching the previous
  // initial-load-only behavior. The top-level `selected` flag mirrors update()'s own
  // convention: true only once every individual voter is selected.
  // Point-voting mode: only voters currently backing this item with points > 0
  // should show as an avatar — a stale entry left at 0 after a reset shouldn't
  // read as an active vote, matching pointVotingSpenders$'s own filter above and
  // the badge's own point-weighted total (voter.component.ts's votesTotal).
  // Binary mode has no such distinction: every voters[] entry is an active vote.
  // Shared between letterboxdSeenMap$ (the API request) and
  // letterboxdSeenProgress$ (the ring's denominator) so the two can't drift
  // apart into different film sets.
  private pollItemTmdbIds(pollItems: PollItem[]): number[] {
    return [...new Set(pollItems.map(item => item.movieId).filter(isDefined))];
  }

  private confirm<T = boolean>(data: ConfirmDialogData<T>): Promise<T | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent<T>, ConfirmDialogData<T>, T | undefined>(
          ConfirmDialogComponent,
          { ...defaultDialogOptions, data }
        )
        .afterClosed()
    );
  }

  private resolveIdentities(
    voters: PollItem["voters"] | undefined,
    identities: Map<string, ResolvedIdentity> | undefined,
    pointVoting?: boolean
  ): ResolvedIdentity[] {
    if (!voters?.length || !identities) {
      return [];
    }
    const active = pointVoting ? voters.filter(voter => (voter.points ?? 0) > 0) : voters;
    return active
      .map(voter => identities.get(voterKey(voter)))
      .filter((identity): identity is ResolvedIdentity => !!identity);
  }

  // voterFilter$ value -> the Set<voterKey> rankFromDuels wants, or undefined
  // when the filter is "everyone" (no narrowing).
  private duelVoterFilterSet(filter: PollItemVoter | undefined): Set<string> | undefined {
    const voters = filter?.voters ?? [];
    if (!voters.length || voters.every(v => v.selected)) {
      return undefined;
    }
    return new Set(voters.filter(v => v.selected).map(v => voterKey(v)));
  }

  private buildVoterFilter(
    pollItems: PollItem[],
    previous: PollItemVoter | undefined,
    extraVoters: UserRef[] = []
  ): PollItemVoter {
    const previousSelection = new Map(
      (previous?.voters ?? []).map(voter => [voterKey(voter), voter.selected])
    );
    const votersMap = new Map<string, { id?: string; localUserId?: string; name: string }>();
    pollItems.forEach(item => {
      item.voters?.forEach(voter => {
        votersMap.set(voterKey(voter), { id: voter.id, localUserId: voter.localUserId, name: voter.name || "Anonymous" });
      });
    });
    // Ranked Duels: voters live in duelBallots, not pollItems[].voters — fold
    // their refs in so the voter-filter menu lists them too.
    extraVoters.forEach(ref => {
      votersMap.set(voterKey(ref), { id: ref.id, localUserId: ref.localUserId, name: ref.name || "Anonymous" });
    });
    const voters = Array.from(votersMap.values()).map(voter => ({
      ...voter,
      selected: previousSelection.get(voterKey(voter)) ?? true,
    }));
    return { name: "All Voters", selected: voters.every(v => v.selected), voters };
  }

  private async generateDescriptionAI(poll: Poll, movieTitles: string[], selectedMovieTitles: string[]) {
    if (!poll.moviepoll) {
      return;
    }


    let description: string;
    if (selectedMovieTitles.length > 0) {
      const aiDescription = await this.gemini.generateSelectedMoviesDescription(poll.name, poll.description, selectedMovieTitles);
      description = `
      ## ${poll.name}
      ${aiDescription}
      `;
    } else {
      description = await this.gemini.generateMoviePollDescription(
        poll.name,
        poll.description,
        movieTitles
      );

    }

    // Save generated description
    await updateDoc(doc(this.pollCollection, poll.id), {
      descriptionAI: description,
    });

    return description;
  }

  private async clearDescriptionAI(pollId: Poll["id"]) {
    await updateDoc(doc(this.pollCollection, pollId), {
      descriptionAI: null,
    });
  }

  private uniqueId(): string {
    const pollCollection = collection(this.firestore, "polls");
    return doc(pollCollection).id;
  }

  // TODO: This was added during major poll data format refactoring to ensuge backwards compability
  // When "old" poll are obsole, this code can be removed
  private checkPollCompability(poll: Poll) {
    // Check if poll is compatible with new pollitem format
    const legacyPoll = poll as Poll & { pollItems?: PollItem[] };
    if (legacyPoll?.pollItems) {
      const pollItems: PollItem[] = legacyPoll.pollItems;
      const ref = this.snackBar.open(
        `This poll needs to be migrated into new Poll format.`,
        "Migrate",
        { duration: 5000 }
      );
      ref.onAction().subscribe(async () => {
        // Add each pollitem into doc/pollItems sub collecation
        pollItems.forEach(async (pollItem) => {
          await this.pollItemService.addPollItemFS(poll.id, pollItem, false);
        });
        await updateDoc(doc(this.pollCollection, poll.id), { pollItems: null });
      });
    }
  }

  private async handleMissingPoll(pollId: Poll['id']) {
    await this.userService.removeRecentPoll(pollId);
    await this.userService.removeFavoritePoll(pollId);
    this.snackBar.open(`Poll with id '${pollId}' has been removed.`, null, { duration: 3000 });
    this.router.navigate(["/"]);
  }
}
