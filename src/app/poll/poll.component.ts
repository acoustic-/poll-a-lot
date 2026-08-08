import {
  Component,
  OnDestroy,
  ChangeDetectionStrategy,
  afterNextRender,
  afterRenderEffect,
  Pipe,
  AfterViewInit,
  Injector,
  runInInjectionContext,
  viewChild,
  ElementRef,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { Observable, BehaviorSubject, NEVER, from, combineLatest, of } from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";

import { Poll, PollItem, PollSuggestion } from "../../model/poll";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { UntypedFormControl } from "@angular/forms";
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
import { defaultDialogOptions } from "../common";
import { EditPollDialogComponent } from "./edit-poll-dialog/edit-poll-dialog.component";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { CdkDragDrop, moveItemInArray } from "@angular/cdk/drag-drop";
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

export interface PollItemVoter {
  id?: string;
  localUserId?: string;
  name: string;
  selected: boolean;
  voters?: PollItemVoter[];
}

// Re-exported so existing importers (voter, movie-poll-item, movie-dialog) keep working.
export { voterKey };

// Vote count for a poll item, narrowed to the currently selected voter filter (or the
// raw count when no filter is applied). Shared by TotalVotesPipe and SortPipe so
// "votes"-based sorting reflects the same filtered numbers shown on screen.
// `pointVoting` defaults to false so every untouched call site stays byte-identical;
// when true, sums each matching voter's `points` (legacy binary votes with no
// `points` field count as 1) instead of counting matching voters.
export function filteredVoteCount(
  item: PollItem,
  selectedVoters?: PollItemVoter[],
  pointVoting = false
): number {
  if (!Array.isArray(item.voters)) return 0;
  const matching = !selectedVoters?.length
    ? item.voters
    : item.voters.filter(voter => {
        const key = voterKey(voter);
        return selectedVoters.some(selected => selected.selected && voterKey(selected) === key);
      });
  return pointVoting
    ? matching.reduce((sum, v) => sum + (v.points ?? 1), 0)
    : matching.length;
}

@Pipe({
  name: "totalDuration",
  pure: true,
  standalone: true
})
export class TotalDurationPipe {
  transform(pollItems: PollItem[], useSeenReactions: boolean): string {
    if (!pollItems) return "0 minutes";
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
    return `${selectedMovies.length ? 'Selected' : 'Duration'}: ${duration} minutes ~ ${Math.floor(duration / 60)} h ${duration % 60} min`;
  }
}

@Pipe({
  name: "totalVotes",
  pure: true,
  standalone: true
})
export class TotalVotesPipe {
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
export class TotalPollItemsPipe {
  transform(pollItems: PollItem[] = [], useSeenReactions: boolean): number {
    return pollItems
      .filter(isDefined)
      .filter(item => (useSeenReactions ? !(item.reactions?.some(r => r.label === SEEN && r.users.length > 0)) : true))
      .filter(item => item.visible !== false)
      .reduce((count, item) => ++count, 0);
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
export class PollMoviesPipe {
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
export class ResolveVotersPipe {
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
  standalone: false
})
export class PollComponent implements AfterViewInit, OnDestroy {
  pollId$: Observable<string | undefined>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<PollItem[]>;
  user$ = new BehaviorSubject<User | undefined>(undefined);
  addingItem$ = new BehaviorSubject<boolean>(false);
  watchedMoviesCount$: Observable<number>;
  hasSelectedMovies$: Observable<boolean>;

  favorite$: Observable<boolean>;
  myPointsUsed$: Observable<number>;
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

  seriesControl: UntypedFormControl;
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  newPollItemName = "";

  useCondensedMovieView = false;
  useBackdropTheme = false;
  hideWatchedMovies = false;
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
  >("smart");

  pluralMapping: {[k: string]: string} = {
    '=0': 's',
    '=1': '',
    'other': 's',
  };

  get user() {
    return this.user$.getValue();
  }

  constructor(
    public userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    private meta: Meta,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private bottomsheet: MatBottomSheet,
    private tmdbService: TMDbService,
    private firestore: Firestore,
    private gemini: GeminiService,
    public pollItemService: PollItemService,
    private analytics: Analytics,
    private injector: Injector,
    private userIdentityService: UserIdentityService,
    private letterboxdService: LetterboxdService
  ) {
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
            if (poll.useSeenReaction === false) {
              this.sortType$.next("regular");
            } else if (poll.movieList || poll.rankedMovieList) {
              this.sortType$.next("ranked");
            }
          }),
          // Firestore errors (e.g. permission-denied — App Check is intentionally
          // skipped during SSR, see app.module.ts) must be caught here, inside the
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
      tap((poll) => this.checkPollCompability(poll))
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
    )
  );


  this.hasSelectedMovies$ = this.pollItems$.pipe(map(items => items.some(i => i.selected)));

  this.watchedMoviesCount$ = this.pollItems$.pipe(
    map((pollItems) =>
      pollItems.reduce(
        (total, current) =>
          current.reactions?.some(
            (r) => r.label === SEEN && r.users.length > 0
          )
            ? ++total
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
  this.allVoterIdentities$ = this.pollItems$.pipe(
    map(pollItems => [
      ...pollItems.flatMap(item => item.voters ?? []),
      ...pollItems.map(item => item.creator).filter(isDefined),
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
      const tmdbIds = [...new Set(pollItems.map(item => item.movieId).filter(isDefined))];
      return this.letterboxdService.getRelationships(member.lid, tmdbIds).pipe(
        map(record => new Map(Object.entries(record).map(([id, info]) => [Number(id), info])))
      );
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
    this.pollItems$.pipe(
      map(pollItems => this.buildVoterFilter(pollItems, this.voterFilter$.value))
    ).subscribe(voters => this.voterFilter$.next(voters))
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
    let dialogRef = this.dialog.open(PollOptionDialogComponent, {
      data: random,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.removePollItem(poll, result, pollItems);
      }
    });
  }

  editPoll(poll: Poll, pollItems: PollItem[]) {
    let bottomSheet = this.bottomsheet.open(EditPollDialogComponent, {
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
        });
        if (updatedPoll.clearPointVotes) {
          await this.pollItemService.resetAllPointVotes(poll.id, pollItems);
        }
      });
  }

  removePollItem(poll: Poll, pollItem: PollItem, pollItems: PollItem[]): void {
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
    let bottomSheet = this.bottomsheet.open(PollDescriptionSheet, {
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

  private buildVoterFilter(
    pollItems: PollItem[],
    previous: PollItemVoter | undefined
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


    let description = '';
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
    if ((poll as any)?.pollItems) {
      const pollItems: PollItem[] = (poll as any).pollItems;
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
