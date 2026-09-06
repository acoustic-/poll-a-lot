import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltip } from "@angular/material/tooltip";
import { DatePipe } from "@angular/common";
import { MetaColorPipe } from "../../../meta-bg-color.pipe";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { Observable, combineLatest, of } from "rxjs";
import { catchError, distinctUntilChanged, map, startWith, switchMap } from "rxjs/operators";
import { Poll, PollItem } from "../../../../model/poll";
import { Movie } from "../../../../model/tmdb";
import { LetterboxdSeenInfo } from "../../../../model/letterboxd";
import { flattenBallots, duelProgress, DuelProgress } from "../../../../model/duel";
import { UserService } from "../../../user.service";
import { AwardsService } from "../../../awards.service";
import { MovieDialogService } from "../../../movie-dialog.service";
import { toUserRef, voterKey } from "../../../user-identity";
import _IsEqual from "lodash.isequal";
import {
  DuelRecord,
  PairStrategy,
  RankedItem,
  defaultTargetDuels,
  nextPair,
  pairKey,
} from "../rank-from-duels";
import { DuelService } from "../duel.service";
import { DuelMovieCacheService } from "../duel-movie-cache.service";
import { DuelBand, OscarStanding, buildDuelBand } from "./duel-view.model";
import { DuelMarkComponent } from "../duel-mark/duel-mark.component";
import { LetterboxdBadgeComponent } from "../../../letterboxd-badge/letterboxd-badge.component";
import { PosterComponent } from "../../../poster/poster.component";

export interface DuelViewData {
  poll: Poll;
  pollItems$: Observable<PollItem[]>;
  ranking$: Observable<RankedItem[]>;
  /** Every voter's records — feeds the info-gain selector's sparsity term. */
  allDuels$: Observable<DuelRecord[]>;
  /** Viewer-scoped "seen on Letterboxd" map, keyed by TMDB id. Optional — only
   *  the poll page supplies it; other callers (tests) can leave it out. */
  letterboxdSeen$?: Observable<Map<number, LetterboxdSeenInfo>>;
  /** "Keep going to sharpen" opened this: serve past the per-voter budget. */
  uncapped?: boolean;
}

/** One marker in the header's round strip. A `gap` pip renders the "···"
 *  ellipsis that stands in for the rounds a truncated strip skips. */
interface DuelPip {
  gap: boolean;
  done: boolean;
  now: boolean;
}

interface PairBands {
  pair: [string, string];
  a: DuelBand;
  b: DuelBand;
}

@Component({
  selector: "duel-view",
  templateUrl: "./duel-view.component.html",
  styleUrls: ["./duel-view.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatTooltip, DatePipe, MetaColorPipe, DuelMarkComponent, LetterboxdBadgeComponent, PosterComponent],
})
export class DuelViewComponent implements OnInit {
  private data = inject<DuelViewData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<DuelViewComponent>>(MatDialogRef);
  private duelService = inject(DuelService);
  private movieDetailCache = inject(DuelMovieCacheService);
  private userService = inject(UserService);
  private awards = inject(AwardsService);
  private movieDialog = inject(MovieDialogService);
  private analytics = inject(Analytics);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);

  private readonly strategy: PairStrategy = this.data.poll.duelVoting?.pairStrategy ?? "infoGain";
  // undefined here => nextPair falls back to defaultTargetDuels(n). `uncapped`
  // (the "keep going to sharpen" re-entry) lifts it entirely for the session.
  private readonly target = this.data.uncapped
    ? Infinity
    : this.data.poll.duelVoting?.targetDuelsPerVoter;
  readonly locked = !!this.data.poll.locked;

  private items: string[] = [];
  private pollItemById = new Map<string, PollItem>();
  private ranking: RankedItem[] = [];
  private allDuels: DuelRecord[] = [];
  private letterboxdSeenMap = new Map<number, LetterboxdSeenInfo>();
  private serverPicks: DuelRecord[] = [];
  private localPicks: DuelRecord[] = [];
  private readonly skipped = new Set<string>();
  private runCompleteLogged = false;

  // reduced-motion: the pick animation's dwell time collapses to 0. The CSS
  // entrance/pick animations switch off on their own via the co-located
  // `@media (prefers-reduced-motion: reduce)` block — no class binding needed
  // (a dead `[class.reduced-motion]="false"` used to sit on the host for this;
  // removed, since nothing in the stylesheet ever read that class).
  private readonly reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  readonly currentPair = signal<[string, string] | null>(null);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly pickingWinner = signal<string | null>(null);
  readonly progress = signal<DuelProgress>({ done: 0, total: 0 });
  // Set when the stream ends: "budget" = hit the per-voter target with real
  // pairs still available (offer "keep going"); "exhausted" = nothing left.
  readonly completionReason = signal<"budget" | "exhausted" | null>(null);
  // Flipped by the in-dialog "keep going" button — lifts the budget for the
  // rest of this session (same as opening via the poll bar's "Keep going").
  private readonly sharpening = signal(false);
  // Full `Movie` detail (genres/cast/ratings) lives in the root-scoped
  // `DuelMovieCacheService` so it survives dialog re-opens; `movieVersion`
  // bumps the `bands` computed when a fetch resolves.
  readonly movieVersion = signal(0);

  readonly complete = computed(() => this.ready() && !this.currentPair());
  readonly round = computed(() => Math.min(this.progress().done + 1, Math.max(this.progress().total, 1)));
  // The header shows one round dot per pair — cute at a handful of movies, but a
  // bigger poll's budget (2n, e.g. 32) or full C(n,2) run (e.g. 120 for 16
  // items) would overrun the header. Above MAX_PIPS the strip truncates in the
  // middle: the first/last few rounds stay pinned, an "···" gap stands in for
  // the skipped stretch, and a window of dots tracks the current round.
  private static readonly MAX_PIPS = 15;
  private static readonly PIP_EDGE = 3;
  readonly pips = computed<DuelPip[]>(() => {
    const { done, total } = this.progress();
    if (total <= 0) return [];
    const dot = (i: number): DuelPip => ({ gap: false, done: i < done, now: i === done });
    if (total <= DuelViewComponent.MAX_PIPS) {
      return Array.from({ length: total }, (_, i) => dot(i));
    }
    const edge = DuelViewComponent.PIP_EDGE;
    const windowLen = DuelViewComponent.MAX_PIPS - 2 * edge - 2; // dots in the moving middle
    const start = Math.min(
      Math.max(done - (windowLen >> 1), edge + 1),
      total - edge - windowLen - 1
    );
    const gap: DuelPip = { gap: true, done: false, now: false };
    return [
      ...Array.from({ length: edge }, (_, i) => dot(i)),
      gap,
      ...Array.from({ length: windowLen }, (_, i) => dot(start + i)),
      gap,
      ...Array.from({ length: edge }, (_, i) => dot(total - edge + i)),
    ];
  });

  readonly bands = computed<PairBands | null>(() => {
    const pair = this.currentPair();
    this.movieVersion(); // re-run when a movie fetch resolves
    if (!pair) return null;
    return { pair, a: this.bandFor(pair[0]), b: this.bandFor(pair[1]) };
  });

  ngOnInit(): void {
    const key$ = this.userService.user$.pipe(
      map(() => this.voterKeyValue),
      distinctUntilChanged()
    );

    // Live ballot for whoever is signed in right now (empty for an anon voter
    // who hasn't picked yet).
    const ballot$ = key$.pipe(
      switchMap((key) =>
        key
          ? this.duelService
              .myBallot$(this.data.poll.id, key)
              .pipe(catchError(() => of(undefined)))
          : of(undefined)
      ),
      map((ballot) => (ballot ? flattenBallots([ballot]) : ([] as DuelRecord[]))),
      distinctUntilChanged(_IsEqual),
      startWith([] as DuelRecord[])
    );

    const letterboxdSeen$ = (
      this.data.letterboxdSeen$ ?? of(new Map<number, LetterboxdSeenInfo>())
    ).pipe(
      catchError(() => of(new Map<number, LetterboxdSeenInfo>())),
      startWith(new Map<number, LetterboxdSeenInfo>())
    );

    combineLatest([
      this.data.pollItems$,
      this.data.ranking$.pipe(startWith([] as RankedItem[])),
      ballot$,
      this.data.allDuels$.pipe(
        catchError(() => of([] as DuelRecord[])),
        startWith([] as DuelRecord[])
      ),
      letterboxdSeen$,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([pollItems, ranking, picks, allDuels, letterboxdSeen]) => {
        this.items = pollItems.map((i) => i.id);
        this.pollItemById = new Map(pollItems.map((i) => [i.id, i]));
        this.ranking = ranking;
        this.allDuels = allDuels;
        this.letterboxdSeenMap = letterboxdSeen;
        if (!this.busy()) {
          this.serverPicks = picks;
          this.localPicks = this.localPicks.filter((lp) =>
            this.items.includes(lp.aId) && this.items.includes(lp.bId)
          );
          this.recompute();
        }
        this.prefetchUpcoming();
      });
  }

  /** Whole-band tap: open the movie dialog (info affordance). */
  openInfo(itemId: string): void {
    const pollItem = this.pollItemById.get(itemId);
    if (!pollItem) return;
    this.movieDialog.openMovie({
      movieId: pollItem.movieId!,
      editable: false,
      isVoteable: false,
      isReactable: false,
      movie: pollItem.moviePollItemData,
      pollItem,
      parent: true,
      locked: !!this.data.poll.locked,
    });
  }

  async pick(winnerId: string): Promise<void> {
    const pair = this.currentPair();
    if (!pair || this.locked || this.busy()) return;
    const [a, b] = pair;
    if (winnerId !== a && winnerId !== b) return;

    this.busy.set(true);
    this.pickingWinner.set(winnerId);
    this.hapticTap();

    // Optimistic: advance immediately, reconcile with the server echo after.
    this.localPicks = [
      ...this.localPicks.filter((p) => pairKey(p.aId, p.bId) !== pairKey(a, b)),
      { voterKey: this.voterKeyValue, aId: a, bId: b, winnerId, ts: Date.now() },
    ];
    this.clearInflight();

    await this.dwell();
    this.pickingWinner.set(null);
    this.recompute();
    // The next pair is on screen and its art is prefetched — free the buttons
    // now rather than holding them disabled through the Firestore round trip.
    // DuelService queues this write behind any still-pending one, so a fast
    // tapper can carry straight on; we only step back in if it actually fails.
    this.busy.set(false);
    this.prefetchUpcoming();

    const result = await this.duelService.recordDuel(this.data.poll.id, a, b, winnerId);

    if (result === "retry") {
      this.localPicks = this.localPicks.filter(
        (p) => pairKey(p.aId, p.bId) !== pairKey(a, b)
      );
      this.recompute();
      this.snackBar.open("Couldn't save that pick — try again", undefined, {
        duration: 3000,
      });
    }
    // "saved": DuelService already logged `duel_pick` — nothing to do.
    // "pending-login": the login dialog just opened and recordDuel will call
    // itself again once it resolves. Leave the optimistic pick in place and
    // stay quiet — rolling it back and showing an error here would be wrong
    // for what's very likely a pick that's about to succeed on its own.
  }

  /** "Too close to call, skip it": parked for this session only. */
  skip(): void {
    const pair = this.currentPair();
    if (!pair || this.busy()) return;
    this.skipped.add(pairKey(pair[0], pair[1]));
    this.clearInflight();
    this.recompute();
    this.prefetchUpcoming();
  }

  close(): void {
    this.dialogRef.close();
  }

  /** In-dialog "keep going to sharpen" — lift the budget and carry on. */
  sharpen(): void {
    this.sharpening.set(true);
    this.completionReason.set(null);
    this.runCompleteLogged = false;
    this.recompute();
    this.prefetchUpcoming();
  }

  backdropUrl(path: string | undefined): string | null {
    return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
  }

  private get myPicks(): DuelRecord[] {
    // Server truth, with any not-yet-echoed optimistic pick merged in.
    const byPair = new Map(this.serverPicks.map((p) => [pairKey(p.aId, p.bId), p]));
    for (const p of this.localPicks) byPair.set(pairKey(p.aId, p.bId), p);
    return [...byPair.values()];
  }

  private get voterKeyValue(): string {
    return voterKey(toUserRef(this.userService.getUser()));
  }

  /** True once the per-voter budget has been lifted for this session. */
  private get uncapped(): boolean {
    return !!this.data.uncapped || this.sharpening();
  }

  /** Effective per-voter duel cap: Infinity for a "keep going" session, the
   *  poll's own override if set, otherwise the `2 × n` default. */
  private get resolvedTarget(): number {
    if (this.uncapped) return Infinity;
    return typeof this.target === "number" ? this.target : defaultTargetDuels(this.items.length);
  }

  private recompute(): void {
    const picks = this.myPicks.map((p) => ({
      aId: p.aId, bId: p.bId, winnerId: p.winnerId, ts: p.ts ?? 0,
    }));
    // Denominator: the budget while capped ("6 OF 32"), the full pair count
    // once the voter opted into "keep going to sharpen".
    this.progress.set(
      duelProgress(this.items, picks, this.uncapped ? undefined : this.resolvedTarget)
    );

    if (this.locked) {
      this.currentPair.set(null);
      this.ready.set(true);
      return;
    }

    const stored = this.readInflight();
    const next =
      stored && this.servable(stored)
        ? stored
        : nextPair(this.items, this.myPicks, this.ranking, this.strategy, this.voterKeyValue, {
            targetDuelsPerVoter: this.resolvedTarget,
            exclude: this.skipped,
            allDuels: this.allDuels,
          });

    this.currentPair.set(next);
    this.ready.set(true);

    if (next) {
      this.completionReason.set(null);
      this.writeInflight(next);
    } else {
      this.clearInflight();
      this.markFinished();
      const n = this.items.length;
      const allPairs = n < 2 ? 0 : (n * (n - 1)) / 2;
      const donePairs = new Set(this.myPicks.map((p) => pairKey(p.aId, p.bId))).size;
      this.completionReason.set(
        this.uncapped || donePairs >= allPairs ? "exhausted" : "budget"
      );
      if (!this.runCompleteLogged) {
        this.runCompleteLogged = true;
        logEvent(this.analytics, "duel_run_complete", {
          pollId: this.data.poll.id,
          duels: this.progress().done,
        });
      }
    }
  }

  private servable(pair: [string, string]): boolean {
    const [a, b] = pair;
    if (!this.items.includes(a) || !this.items.includes(b)) return false;
    if (this.skipped.has(pairKey(a, b))) return false;
    const done = new Set(this.myPicks.map((p) => pairKey(p.aId, p.bId)));
    if (done.has(pairKey(a, b))) return false;
    if (done.size >= this.resolvedTarget) {
      return false;
    }
    return true;
  }

  private movieFor(itemId: string): Movie | undefined {
    const movieId = this.pollItemById.get(itemId)?.movieId;
    return movieId ? this.movieDetailCache.get(movieId) : undefined;
  }

  /** A full band for one side — the pure `buildDuelBand` plus the two
   *  caller-supplied extras (Oscar standing, Letterboxd "seen"). */
  private bandFor(itemId: string): DuelBand {
    const pollItem = this.pollItemById.get(itemId);
    const movieId = pollItem?.movieId;
    return buildDuelBand(pollItem, this.movieFor(itemId), {
      oscar: movieId ? this.oscarStanding(movieId) : "none",
      letterboxdSeen: movieId ? this.letterboxdSeenMap.get(movieId) : undefined,
    });
  }

  private oscarStanding(movieId: number): OscarStanding {
    const awards = this.awards.getOscarAwardsForMovie(movieId);
    if (awards.some((a) => a.won)) return "won";
    return awards.length ? "nominated" : "none";
  }

  /** Ensure the current pair's — and the *predicted next* pair's — full movie
   *  detail (genres + cast + OMDb/Letterboxd ratings) is loading or loaded, so
   *  the next duel's cards are already populated the instant it appears rather
   *  than popping their genres/cast/ratings in after a beat.
   *
   *  `DuelMovieCacheService` holds the assembled `Movie` process-wide, so a film
   *  seen in an earlier run (or warmed by the poll page before the dialog
   *  opened) is served straight from memory — no refetch, no progressive
   *  re-paint. Failure just leaves a band on its snapshot fields, and a wrong
   *  look-ahead guess only costs one uncached movie — exactly the pre-look-ahead
   *  behaviour. */
  private prefetchUpcoming(): void {
    const itemIds = new Set<string>();
    for (const pair of [this.currentPair(), this.predictedNextPair()]) {
      if (pair) {
        itemIds.add(pair[0]);
        itemIds.add(pair[1]);
      }
    }
    for (const itemId of itemIds) {
      const movieId = this.pollItemById.get(itemId)?.movieId;
      if (!movieId || this.movieDetailCache.get(movieId)) continue;
      this.movieDetailCache
        .ensure(movieId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.movieVersion.update((v) => v + 1));
    }
  }

  /** The pair `nextPair` will serve once the current one is picked — a
   *  prediction used only to warm its movie detail ahead of time.
   *
   *  It's a single speculative call with an arbitrary winner, and that's
   *  enough: the connectivity-seed stage doesn't depend on who won, and the
   *  info-gain stage reads `this.ranking`, which hasn't folded in the current
   *  pick's outcome yet either. So the guess only goes stale once the real
   *  ranking echoes back — at which point the following `prefetchUpcoming`
   *  (from the ballot stream) corrects it. */
  private predictedNextPair(): [string, string] | null {
    const current = this.currentPair();
    if (!current) return null;
    const synthetic: DuelRecord = {
      voterKey: this.voterKeyValue,
      aId: current[0],
      bId: current[1],
      winnerId: current[0],
      ts: Date.now(),
    };
    return nextPair(
      this.items,
      [...this.myPicks, synthetic],
      this.ranking,
      this.strategy,
      this.voterKeyValue,
      {
        targetDuelsPerVoter: this.resolvedTarget,
        exclude: this.skipped,
        allDuels: [...this.allDuels, synthetic],
      }
    );
  }

  private dwell(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.reducedMotion ? 0 : 200));
  }

  private hapticTap(): void {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  }

  private inflightKey(): string {
    return `duel-inflight-${this.data.poll.id}-${this.voterKeyValue}`;
  }

  private readInflight(): [string, string] | null {
    try {
      const raw = localStorage.getItem(this.inflightKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length === 2 ? [String(parsed[0]), String(parsed[1])] : null;
    } catch {
      return null;
    }
  }

  private writeInflight(pair: [string, string]): void {
    try {
      localStorage.setItem(this.inflightKey(), JSON.stringify(pair));
    } catch {
      /* private mode / storage disabled — resume just falls back to nextPair */
    }
  }

  private clearInflight(): void {
    try {
      localStorage.removeItem(this.inflightKey());
    } catch {
      /* ignore */
    }
  }

  /** Per-voter "has completed a run at least once" flag — the poll page reads
   *  it to show the "N new films to place" nudge after items are added later. */
  private markFinished(): void {
    try {
      localStorage.setItem(`duel-finished-${this.data.poll.id}-${this.voterKeyValue}`, "1");
    } catch {
      /* ignore */
    }
  }
}
