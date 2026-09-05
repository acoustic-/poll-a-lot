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

  // Rapid-tap debounce (same idea as PollItemService.pointAllocationInFlight):
  // while a pick write is in flight for this tab, another recordDuel call is
  // refused rather than firing a second transaction for the same tap. This is
  // no longer what makes concurrent writes *safe* — recordDuel's transaction
  // handles that on its own, including races from a second tab or device —
  // it's purely to avoid a wasted round trip for an accidental double-tap.
  private writeInFlight = false;

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
   * Returns:
   *  - `"saved"` — persisted; the caller may advance to the next pair.
   *  - `"retry"` — not saved (write in flight or a transaction error); the
   *    caller must not advance, and should tell the voter to try again.
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
    if (this.writeInFlight) {
      return "retry";
    }

    const ref = toUserRef(this.userService.getUser());
    const key = voterKey(ref);
    if (!key) {
      return "retry";
    }

    this.writeInFlight = true;
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
    } finally {
      this.writeInFlight = false;
    }
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
        deleteDoc(d.ref).catch(() =>
          setDoc(d.ref, {
            voterRef: (d.data() as { voterRef?: unknown }).voterRef ?? {},
            updatedAt: Date.now(),
            picks: [],
          })
        )
      )
    );
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
