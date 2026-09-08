import { Injectable, Injector, inject, runInInjectionContext } from "@angular/core";
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDocs,
  runTransaction,
  setDoc,
} from "@angular/fire/firestore";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { Observable, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { UserService } from "../../user.service";
import { toUserRef, voterKey } from "../../user-identity";
import { DuelBallot, DuelPick } from "../../../model/duel";

/**
 * Read/write access to a poll's `duelBallots` subcollection — one ballot doc
 * per voter, keyed by `voterKey(user)`. Every write here touches only the
 * caller's own ballot, so there is a single writer per doc and picks never race
 * another voter (unlike a shared array on the poll / pollItems docs).
 *
 * Kept deliberately thin: the aggregation maths lives in the Firebase-free
 * `rank-from-duels.ts`, and `flattenBallots` / `duelProgress` in `model/duel.ts`.
 */
@Injectable({ providedIn: "root" })
export class DuelService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private userService = inject(UserService);
  private analytics = inject(Analytics);

  // Serialises this tab's pick writes: pick N+1's transaction is chained behind
  // pick N's rather than being refused, so a voter can tap straight through a
  // run without waiting for each round trip and without ever seeing a spurious
  // "couldn't save" when two picks overlap. Each transaction still only touches
  // this voter's own ballot doc and replaces (not stacks) any earlier pick for
  // the same pair, so queueing loses nothing; cross-tab / cross-device races
  // are handled by runTransaction itself.
  private writeChain: Promise<unknown> = Promise.resolve();

  ballots$(pollId: string): Observable<DuelBallot[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(this.ballotsCollection(pollId), { idField: "id" })
    ) as Observable<DuelBallot[]>;
  }

  myBallot$(pollId: string, voterKeyValue: string): Observable<DuelBallot | undefined> {
    return (
      runInInjectionContext(this.injector, () =>
        docData(doc(this.ballotsCollection(pollId), voterKeyValue), { idField: "id" })
      ) as Observable<DuelBallot | undefined>
    ).pipe(catchError(() => of(undefined)));
  }

  /**
   * Append one pick to the current user's ballot, inside a Firestore
   * transaction: the read and the write are atomic against the server, so a
   * second tab, a second device, or a background tab waking up can't race
   * this one and silently lose a pick (a transaction retries itself on
   * contention instead). Opens the login flow for a brand-new anonymous voter
   * the same way every other first write in the app does.
   *
   * The write is queued behind any earlier pick from this tab (`writeChain`),
   * so the caller doesn't need to block its UI on the round trip — it can
   * advance to the next pair optimistically the moment the pick is made and
   * only react if this later resolves to `"retry"`.
   *
   * Returns:
   *  - `"saved"` — persisted; the optimistic advance stands.
   *  - `"retry"` — not saved (a transaction error); the caller should roll the
   *    optimistic pick back and tell the voter to try again.
   *  - `"pending-login"` — the login dialog just opened; recordDuel will call
   *    itself again once it resolves. Not a failure: the caller should leave
   *    its optimistic state alone and stay quiet rather than show an error
   *    for a pick that's very likely about to succeed on its own.
   */
  async recordDuel(
    pollId: string,
    aId: string,
    bId: string,
    winnerId: string
  ): Promise<"saved" | "retry" | "pending-login"> {
    if (aId === bId || (winnerId !== aId && winnerId !== bId)) {
      return "retry";
    }
    if (
      !this.userService.getUserOrOpenLogin(() => {
        void this.recordDuel(pollId, aId, bId, winnerId);
      })
    ) {
      return "pending-login";
    }

    const ref = toUserRef(this.userService.getUser());
    const key = voterKey(ref);
    if (!key) {
      return "retry";
    }

    // Chain this write after whatever is already pending for the tab, but don't
    // let one write's rejection break the chain for the next.
    const run = this.writeChain.then(() =>
      this.commitPick(pollId, key, ref, aId, bId, winnerId)
    );
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Undo one pick — drop the voter's pick for a given pair from their ballot.
   * Same single-writer, transactional, write-chained path as `recordDuel`, so
   * an undo tapped straight after a pick can't race that pick's own write.
   * Returns `"saved"` (also when the pick was already gone — a harmless no-op)
   * or `"retry"` (transaction error — the caller should restore its optimistic
   * state). No login flow: with no signed-in voter there's nothing to undo.
   */
  async removeDuel(
    pollId: string,
    aId: string,
    bId: string
  ): Promise<"saved" | "retry"> {
    const user = this.userService.getUser();
    if (!user) {
      return "retry";
    }
    const ref = toUserRef(user);
    const key = voterKey(ref);
    if (!key) {
      return "retry";
    }
    const run = this.writeChain.then(() =>
      this.commitRemoval(pollId, key, ref, aId, bId)
    );
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  /** A single voter clears their own ballot ("redo my duels"). */
  async resetMyDuels(pollId: string, voterKeyValue: string): Promise<void> {
    if (!voterKeyValue) {
      return;
    }
    await deleteDoc(doc(this.ballotsCollection(pollId), voterKeyValue)).catch(
      // Anonymous voters can't `delete` per firestore.rules — fall back to
      // overwriting picks with an empty ballot.
      () =>
        setDoc(doc(this.ballotsCollection(pollId), voterKeyValue), {
          voterRef: toUserRef(this.userService.getUser()),
          updatedAt: Date.now(),
          picks: [],
        })
    );
  }

  /**
   * Owner-triggered wipe of every ballot ("clear duels" in the edit dialog).
   * Deletes each doc when the caller may (`firestore.rules` gates delete on
   * `request.auth`), and falls back to emptying `picks` for a weak (anonymous)
   * poll owner — `rankFromDuels` treats an empty ballot as no duels either way.
   */
  async resetAllDuels(pollId: string): Promise<void> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(this.ballotsCollection(pollId))
    );
    await Promise.all(
      snap.docs.map((d) =>
        deleteDoc(d.ref)
          .catch(() =>
            setDoc(d.ref, {
              voterRef: (d.data() as { voterRef?: unknown }).voterRef ?? {},
              updatedAt: Date.now(),
              picks: [],
            })
          )
          // A weak (anonymous) owner can neither delete nor overwrite a
          // signed-in voter's ballot (firestore.rules). Swallow that per-ballot
          // so one un-clearable ballot doesn't reject the whole Promise.all and
          // surface as an unhandled rejection in editPoll's afterDismissed.
          .catch((error) =>
            console.error("Failed to clear a duel ballot:", pollId, d.id, error)
          )
      )
    );
  }

  /** The actual transactional write for one pick — always reached via
   *  `writeChain` so tab-local picks commit in order. */
  private async commitPick(
    pollId: string,
    key: string,
    ref: ReturnType<typeof toUserRef>,
    aId: string,
    bId: string,
    winnerId: string
  ): Promise<"saved" | "retry"> {
    try {
      const ballotDoc = doc(this.ballotsCollection(pollId), key);
      const pick: DuelPick = { aId, bId, winnerId, ts: Date.now() };
      await runInInjectionContext(this.injector, () =>
        runTransaction(this.firestore, async (tx) => {
          const snap = await tx.get(ballotDoc);
          const existing: DuelPick[] = snap.exists() ? (snap.data()?.["picks"] ?? []) : [];
          // Drop any earlier pick for this same pair — one pick per voter per
          // pair, a changed mind replaces rather than stacks (mirrors
          // rankFromDuels).
          const picks = [...existing.filter((p) => !this.samePair(p, pick)), pick];
          tx.set(ballotDoc, { voterRef: ref, updatedAt: Date.now(), picks });
        })
      );
      logEvent(this.analytics, "duel_pick", { pollId });
      return "saved";
    } catch (error) {
      console.error("Failed to record duel pick:", pollId, error);
      return "retry";
    }
  }

  /** The transactional counterpart to `commitPick` — reached via `writeChain`
   *  so a pick and its undo commit in the order they were tapped. */
  private async commitRemoval(
    pollId: string,
    key: string,
    ref: ReturnType<typeof toUserRef>,
    aId: string,
    bId: string
  ): Promise<"saved" | "retry"> {
    try {
      const ballotDoc = doc(this.ballotsCollection(pollId), key);
      await runInInjectionContext(this.injector, () =>
        runTransaction(this.firestore, async (tx) => {
          const snap = await tx.get(ballotDoc);
          if (!snap.exists()) {
            return;
          }
          const existing: DuelPick[] = snap.data()?.["picks"] ?? [];
          const picks = existing.filter(
            (p) => !this.samePair(p, { aId, bId })
          );
          if (picks.length === existing.length) {
            return; // nothing to remove — treat as a successful no-op
          }
          tx.set(ballotDoc, { voterRef: ref, updatedAt: Date.now(), picks });
        })
      );
      logEvent(this.analytics, "duel_undo", { pollId });
      return "saved";
    } catch (error) {
      console.error("Failed to undo duel pick:", pollId, error);
      return "retry";
    }
  }

  private ballotsCollection(pollId: string) {
    return collection(this.firestore, `polls/${pollId}/duelBallots`);
  }

  private samePair(a: { aId: string; bId: string }, b: { aId: string; bId: string }): boolean {
    return (
      (a.aId === b.aId && a.bId === b.bId) ||
      (a.aId === b.bId && a.bId === b.aId)
    );
  }
}
