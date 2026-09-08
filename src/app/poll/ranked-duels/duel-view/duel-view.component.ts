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
import { ImageColorService } from "../../../shared/image-color.service";
import { rgbChannels } from "../../../shared/color.util";
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
  /** Item ids that have left the arena — seen-marked or owner-hidden movies.
   *  Their existing picks still count in `ranking$` (computed upstream over the
   *  full set); they're just no longer served as match-ups and drop out of the
   *  per-voter budget. Live, so a mid-run "seen" mark takes effect at once.
   *  Optional — non-poll callers can omit it (nothing leaves the arena). */
  deprioritizedIds$?: Observable<ReadonlySet<string>>;
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
  private imageColor = inject(ImageColorService);
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
  private deprioritized: ReadonlySet<string> = new Set();
  private letterboxdSeenMap = new Map<number, LetterboxdSeenInfo>();
  private serverPicks: DuelRecord[] = [];
  private localPicks: DuelRecord[] = [];
  // pairKeys the voter has just undone, suppressed from `myPicks` until the
  // server echo drops them too (mirrors `localPicks` on the add side).
  private readonly undonePairs = new Set<string>();
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

  // itemId -> the backdrop's dominant colour for the band: `tint` is the
  // "r g b" channels (scrim wash + ticket / genre-chip fill), `ink` is the
  // readable text colour ON that fill (same `readableInk` the movie dialog's
  // "available on" chip uses). Near-black / white until ImageColorService
  // resolves; `tintVersion` re-runs the template bindings when one lands.
  private readonly tintByItem = new Map<string, { tint: string; ink: string }>();
  readonly tintVersion = signal(0);
  private static readonly TINT_FALLBACK = { tint: "6 5 12", ink: "#fff" };

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
    this.tintVersion(); // ...and when a backdrop colour resolves (`--tint`)
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

    const emptySet = new Set<string>() as ReadonlySet<string>;
    const deprioritized$ = (this.data.deprioritizedIds$ ?? of(emptySet)).pipe(
      catchError(() => of(emptySet)),
      startWith(emptySet)
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
      deprioritized$,
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([pollItems, ranking, picks, allDuels, letterboxdSeen, deprioritized]) => {
        this.items = pollItems.map((i) => i.id);
        this.pollItemById = new Map(pollItems.map((i) => [i.id, i]));
        this.ranking = ranking;
        this.allDuels = allDuels;
        this.letterboxdSeenMap = letterboxdSeen;
        this.deprioritized = deprioritized;
        if (!this.busy()) {
          this.serverPicks = picks;
          // Stop suppressing an undone pair once the server echo has dropped it.
          const serverPairs = new Set(picks.map((p) => pairKey(p.aId, p.bId)));
          for (const key of [...this.undonePairs]) {
            if (!serverPairs.has(key)) this.undonePairs.delete(key);
          }
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
    // A fresh pick supersedes any pending undo of the same pair — otherwise
    // `myPicks` would keep deleting this pick until the (now stale) removal
    // echoes, re-serving the pair and hiding the pick.
    this.undonePairs.delete(pairKey(a, b));
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

  /** Undo the most recent pick and step the arena back onto that pair — for an
   *  accidental PICK tap. Repeatable: each press walks back one more pick. The
   *  pick is dropped from the ballot (so it stops feeding the ranking too), not
   *  just hidden. */
  async undo(): Promise<void> {
    if (this.busy() || this.locked) return;
    // No resolved voter yet (a brand-new anonymous voter whose first pick just
    // opened the login dialog): `removeDuel` can't act, and dropping the
    // still-unpersisted local pick here would only make it reappear when the
    // queued `recordDuel` commits post-login. Let them undo once signed in.
    if (!this.voterKeyValue) return;
    const picks = this.myPicks;
    if (picks.length === 0) return;
    // Walk back *this* session's own optimistic picks first (newest by ts);
    // only once those are exhausted do we reach for a pick made in an earlier
    // session or on another device — whose server `ts` (commit time) can
    // otherwise out-rank a local tap and get undone instead.
    const localKeys = new Set(this.localPicks.map((p) => pairKey(p.aId, p.bId)));
    const mineThisSession = picks.filter((p) => localKeys.has(pairKey(p.aId, p.bId)));
    const pool = mineThisSession.length > 0 ? mineThisSession : picks;
    const last = pool.reduce((a, b) => ((b.ts ?? 0) >= (a.ts ?? 0) ? b : a));
    const a = last.aId;
    const b = last.bId;
    const key = pairKey(a, b);

    // Optimistic: take the pick back and put its pair back on screen. Stay
    // `busy` through the round trip (unlike pick(), this isn't a fast-tap flow)
    // so a second undo can't race this one's write.
    this.busy.set(true);
    this.localPicks = this.localPicks.filter((p) => pairKey(p.aId, p.bId) !== key);
    this.undonePairs.add(key);
    this.skipped.delete(key);
    this.completionReason.set(null);
    this.runCompleteLogged = false;
    this.pickingWinner.set(null);
    this.writeInflight([a, b]);
    this.recompute();
    this.prefetchUpcoming();

    const result = await this.duelService.removeDuel(this.data.poll.id, a, b);
    if (result === "retry") {
      this.undonePairs.delete(key);
      this.snackBar.open("Couldn't undo that — try again", undefined, {
        duration: 3000,
      });
    }
    this.busy.set(false);
    this.recompute();
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

  /** `--tint` channels for a band — the backdrop's dominant colour once it has
   *  resolved, a near-black fallback until then. Reads `tintVersion` so the
   *  OnPush template re-binds when a colour lands. */
  tintFor(itemId: string): string {
    this.tintVersion();
    return (this.tintByItem.get(itemId) ?? DuelViewComponent.TINT_FALLBACK).tint;
  }

  /** `--tint-ink` for a band — the readable text colour on the tint fill. */
  tintInkFor(itemId: string): string {
    this.tintVersion();
    return (this.tintByItem.get(itemId) ?? DuelViewComponent.TINT_FALLBACK).ink;
  }

  private get myPicks(): DuelRecord[] {
    // Server truth, with any not-yet-echoed optimistic pick merged in and any
    // just-undone pair taken back out.
    const byPair = new Map(this.serverPicks.map((p) => [pairKey(p.aId, p.bId), p]));
    for (const p of this.localPicks) byPair.set(pairKey(p.aId, p.bId), p);
    for (const key of this.undonePairs) byPair.delete(key);
    return [...byPair.values()];
  }

  private get voterKeyValue(): string {
    return voterKey(toUserRef(this.userService.getUser()));
  }

  /** True once the per-voter budget has been lifted for this session. */
  private get uncapped(): boolean {
    return !!this.data.uncapped || this.sharpening();
  }

  /** Item ids still in play for pair selection: every poll item except the
   *  seen / owner-hidden ones. Their picks already counted upstream in
   *  `ranking`; here they simply stop being served and leave the budget. */
  private get servableItems(): string[] {
    return this.deprioritized.size
      ? this.items.filter((id) => !this.deprioritized.has(id))
      : this.items;
  }

  /** Effective per-voter duel cap: Infinity for a "keep going" session, the
   *  poll's own override if set, otherwise `2 × (servable item count)` — the
   *  default shrinks as movies are marked seen/hidden mid-run. */
  private get resolvedTarget(): number {
    if (this.uncapped) return Infinity;
    return typeof this.target === "number" ? this.target : defaultTargetDuels(this.servableItems.length);
  }

  private recompute(): void {
    const picks = this.myPicks.map((p) => ({
      aId: p.aId, bId: p.bId, winnerId: p.winnerId, ts: p.ts ?? 0,
    }));
    // Denominator: the budget while capped ("6 OF 32"), the full pair count
    // once the voter opted into "keep going to sharpen".
    this.progress.set(
      duelProgress(this.servableItems, picks, this.uncapped ? undefined : this.resolvedTarget)
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
        : nextPair(this.servableItems, this.myPicks, this.ranking, this.strategy, this.voterKeyValue, {
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
      // "exhausted" vs "budget" is judged over the servable set only — a run
      // that covered every still-in-play pair is done, not merely budget-capped,
      // even if seen/hidden movies mean fewer pairs than the raw item count.
      const servable = this.servableItems;
      const n = servable.length;
      const allPairs = n < 2 ? 0 : (n * (n - 1)) / 2;
      const servableSet = new Set(servable);
      const donePairs = new Set(
        this.myPicks
          .filter((p) => servableSet.has(p.aId) && servableSet.has(p.bId))
          .map((p) => pairKey(p.aId, p.bId))
      ).size;
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
    // `servableItems` (not `items`) so a stored in-flight pair whose movie has
    // since been marked seen/hidden isn't re-served.
    const servable = this.servableItems;
    if (!servable.includes(a) || !servable.includes(b)) return false;
    if (this.skipped.has(pairKey(a, b))) return false;
    const servableSet = new Set(servable);
    const done = new Set(
      this.myPicks
        .filter((p) => servableSet.has(p.aId) && servableSet.has(p.bId))
        .map((p) => pairKey(p.aId, p.bId))
    );
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
      this.ensureTint(itemId);
      const movieId = this.pollItemById.get(itemId)?.movieId;
      if (!movieId || this.movieDetailCache.get(movieId)) continue;
      this.movieDetailCache
        .ensure(movieId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.movieVersion.update((v) => v + 1));
    }
  }

  /** Kick off the backdrop-colour extraction for `itemId` if it hasn't started.
   *  ImageColorService de-dupes by URL and no-ops during SSR; a failure just
   *  leaves the band on its near-black fallback tint. */
  private ensureTint(itemId: string): void {
    if (this.tintByItem.has(itemId)) return;
    const path = this.pollItemById.get(itemId)?.moviePollItemData?.backdropPath;
    const url = this.backdropUrl(path);
    if (!url) return;
    this.tintByItem.set(itemId, DuelViewComponent.TINT_FALLBACK); // mark in-flight
    this.imageColor
      .colors(url)
      .then((colors) => {
        this.tintByItem.set(itemId, {
          tint: rgbChannels(colors.dominant),
          ink: colors.ink,
        });
        this.tintVersion.update((v) => v + 1);
      })
      .catch(() => {
        /* keep the fallback */
      });
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
      this.servableItems,
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
