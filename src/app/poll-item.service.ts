import { Injectable, DOCUMENT, Injector, runInInjectionContext, inject } from "@angular/core";
import { PollItem } from "../model/poll";
import { Movie, TMDbMovie } from "../model/tmdb";
import { UserService } from "./user.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  collection,
  collectionData,
  deleteDoc,
  doc,
  Firestore,
  updateDoc,
  DocumentReference, 
  setDoc
} from "@angular/fire/firestore";
import { TMDbService } from "./tmdb.service";
import { first, switchMap, map, tap } from "rxjs/operators";
import { Observable, of } from "rxjs";
import { User } from "../model/user";
import { toUserRef } from "./user-identity";
import { getSimpleMovieTitle } from "./movie-poll-item/movie-helpers";


export type MoviePollItemTemplate = Readonly<Omit<PollItem, "id" | "pollId" | "movieIndex" | "order">>;

// Single source of truth for "points per voter when ranked point voting is on but
// `pointVotingBudget` hasn't been explicitly set" — used both to fall back a poll's
// unset budget when reading it, and to seed the edit-dialog's budget field the first
// time the toggle is switched on.
export const DEFAULT_POINT_VOTING_BUDGET = 5;

// Shared with every caller that projects a <point-vote-stepper> into <voter> (movie
// and generic poll items alike), so the button-disabled math lives in exactly one
// place instead of being re-derived at each call site. `maxPerItem == null` (not
// `=== undefined`) deliberately catches both: in-memory "unlimited" is `undefined`,
// but Firestore can't store `undefined`, so a value once explicitly cleared and
// saved comes back as `null` on the next read — both must mean "no cap".
export function canAddPoint(
  budgetRemaining: number,
  myPoints: number,
  maxPerItem?: number | null
): boolean {
  return budgetRemaining > 0 && (maxPerItem == null || myPoints < maxPerItem);
}

export function canRemovePoint(myPoints: number): boolean {
  return myPoints > 0;
}

@Injectable()
export class PollItemService {
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);
  private tmdbService = inject(TMDbService);
  private firestore = inject(Firestore);
  private document = inject<Document>(DOCUMENT);
  private injector = inject(Injector);

  private getMovieTitle = getSimpleMovieTitle;

  // Dampens (doesn't fully solve) rapid-tap races on the point stepper: while an
  // allocation is in flight for this tab, further allocatePoint calls — even for a
  // different item — are dropped rather than queued, since the budget check reads
  // from an in-memory snapshot that a concurrent write would make stale.
  private pointAllocationInFlight = false;

  async addPollItemFS(
    pollId: string,
    newPollItem: Omit<PollItem, "pollId">,
    showSnack = true
  ) {
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    await setDoc(doc(pollItemsCollection, newPollItem.id), {
      ...newPollItem,
      pollId,
    }).then(() => {
      // gtag('event', 'addNewOption');
      if (showSnack) {
        this.snackBar.open(
          "Added new option to the poll. Happy voting!",
          undefined,
          { duration: 5000 }
        );
      }
    });
  }

  async addMoviePollItem(
    movie: Movie | TMDbMovie,
    pollId: string,
    existingMovieIds: number[] | undefined,
    newPoll = false,
    confirm = true
  ): Promise<Observable<Readonly<PollItem | undefined>>> {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addMoviePollItem(movie, pollId, existingMovieIds, newPoll, confirm)
      )
    ) {
      return Promise.resolve(of(undefined));
    }

    const checkDuplicates = (movieId: number, movieIds: number[]): boolean => {
      if (movieIds.find((existingId) => existingId === movieId)) {
        this.snackBar.open(
          "You already have this on the list. Add something else!",
          undefined,
          { duration: 5000 }
        );
        return true;
      }
      return false;
    };

    const addMovie = (movieIds: number[]): Observable<Readonly<PollItem | undefined>> | undefined => {
      // There are duplicates
      if (movieIds.length && checkDuplicates(movie.id, movieIds)) {
        return of(undefined);
        // Don't add to database, just return new item
      } else if (newPoll === true) {
        return this.getNewMoviePollItem$(
          pollId,
          movie.id,
          movieIds.length
        ).pipe(map((newPollItem) => ({ ...newPollItem, pollId } as PollItem)));
      } else {
        if (confirm) {
          const ref = this.snackBar.open(
            `Are you sure you want to add ${this.getMovieTitle(movie)}?`,
            "Add",
            { duration: 5000 }
          );
          

          return ref.onAction().pipe(
            switchMap(() =>
              this.getNewMoviePollItem$(
                pollId,
                movie.id,
                movieIds.length
              ).pipe(
                tap((newPollItem) => this.addPollItemFS(pollId, newPollItem))
              )
            ),
            first(),
            map((pollItem) => ({ ...pollItem, pollId } as PollItem))
          );
        }
        return of(undefined);
      }
    };

    if (existingMovieIds === undefined) {
      // Existing movies not available, load pollitems. collectionData()
      // needs an active Angular injection context (an AngularFire dev-mode
      // warning otherwise) but this runs from a user-triggered "add movie"
      // call, not synchronously from the constructor.
      return runInInjectionContext(this.injector, () =>
        collectionData(
          collection(this.firestore, `polls/${pollId}/pollItems`)
        )
      ).pipe(
        first(),
        switchMap((pollItems: PollItem[]) => {
          const movieIds = pollItems.map((p) => p.movieId);
          // Check duplicates
          return addMovie(movieIds);
        })
      );
    } else {
      return addMovie(existingMovieIds);
    }
  }

  async vote(
    pollId: string,
    pollItem: PollItem,
    pollItems: PollItem[],
    selectMultiple: boolean
  ): Promise<void> {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.vote(pollId, pollItem, pollItems, selectMultiple)
      )
    ) {
      return;
    }
    const user = this.userService.getUser();
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    const pollItemDoc = doc(pollItemsCollection, pollItem.id);

    if (selectMultiple) {
      if (!this.hasVoted(pollItem, user)) {
        // add vote
        await this.addVoteFS(pollItemDoc, pollItem, user);
      } else {
        // remove vote
        await this.removeVoteFS(pollItemDoc, pollItem, user);
      }
    } else {
      // Since user can only select single options, users votes on other items need to be subtracted
      const hasVoted = this.hasVoted(pollItem, user);

      // Remove votes that user has given exists
      const userHasVotedIds = pollItems
        .filter((p) =>
          p.voters.some((voter) => this.userService.usersAreEqual(user, voter))
        )
        .map((p) => p.id);
      userHasVotedIds.forEach(async (pollItemId) => {
        const selectedPollItem = pollItems.find((p) => p.id === pollItemId);
        this.removeVoteFS(
          doc(pollItemsCollection, pollItemId),
          selectedPollItem,
          user
        );
      });

      if (!hasVoted) {
        // Add vote if user hadn't yet voted
        await this.addVoteFS(pollItemDoc, pollItem, user);
      }
    }
  }

  async reaction(pollId: string, pollItem: PollItem, reaction: string) {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.reaction(pollId, pollItem, reaction)
      )
    ) {
      return;
    }

    const user = this.userService.getUser();
    const userRef = toUserRef(user);
    let updatedReactions = pollItem.reactions || [];

    // Remove, Add to existing or add new
    if (updatedReactions?.some((r) => r.label === reaction)) {
      updatedReactions = updatedReactions.map((r) =>
        r.label === reaction
          ? {
              label: r.label,
              users: [
                ...(r.users.some((u) => this.userService.isCurrentUser(u))
                  ? r.users.filter((u) => !this.userService.isCurrentUser(u))
                  : [...r.users, userRef]),
              ],
            }
          : r
      );
    } else {
      updatedReactions = [
        ...updatedReactions,
        { label: reaction, users: [userRef] },
      ];
    }
    // remove empty reactions
    updatedReactions = updatedReactions.filter((r) => r.users.length > 0);

    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    const pollItemDoc = doc(pollItemsCollection, pollItem.id);
    await updateDoc(pollItemDoc, { reactions: updatedReactions });
  }

  hasVoted(pollItem: PollItem, viewUser: User = undefined): boolean {
    const user = viewUser ? viewUser : this.userService.getUser();
    if (!user) {
      return false;
    }
    return pollItem.voters.some((voter) =>
      this.userService.usersAreEqual(voter, user)
    );
  }

  // This user's points on this item, 0 if they haven't voted for it or their vote
  // predates ranked voting on this poll (no `points` field yet) — the stepper starts
  // such voters at 0 rather than crediting them a point they never spent from their
  // budget; the first `+` tap upgrades their existing voters[] entry in place.
  getUserPoints(pollItem: PollItem, user: User): number {
    if (!user || !Array.isArray(pollItem?.voters)) {
      return 0;
    }
    const voter = pollItem.voters.find((v) =>
      this.userService.usersAreEqual(v, user)
    );
    return voter?.points ?? 0;
  }

  getUsedBudget(pollItems: PollItem[], user: User): number {
    if (!user || !Array.isArray(pollItems)) {
      return 0;
    }
    return pollItems.reduce(
      (sum, pollItem) => sum + this.getUserPoints(pollItem, user),
      0
    );
  }

  async allocatePoint(
    pollId: string,
    pollItem: PollItem,
    pollItems: PollItem[],
    budget: number,
    maxPerItem: number | null | undefined,
    delta: 1 | -1
  ): Promise<void> {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.allocatePoint(pollId, pollItem, pollItems, budget, maxPerItem, delta)
      )
    ) {
      return;
    }

    if (this.pointAllocationInFlight) {
      return;
    }

    const user = this.userService.getUser();
    const currentPoints = this.getUserPoints(pollItem, user);

    if (delta > 0) {
      const usedBudget = this.getUsedBudget(pollItems, user);
      if (usedBudget >= budget) {
        this.snackBar.open(
          `You've already used all ${budget} of your points!`,
          undefined,
          { duration: 3000 }
        );
        return;
      }
      if (maxPerItem != null && currentPoints >= maxPerItem) {
        this.snackBar.open(
          `You can't put more than ${maxPerItem} point${maxPerItem === 1 ? "" : "s"} on one item!`,
          undefined,
          { duration: 3000 }
        );
        return;
      }
    } else if (currentPoints <= 0) {
      return;
    }

    const newPoints = Math.max(0, currentPoints + delta);

    this.pointAllocationInFlight = true;
    try {
      const pollItemsCollection = collection(
        this.firestore,
        `polls/${pollId}/pollItems`
      );
      const pollItemDoc = doc(pollItemsCollection, pollItem.id);
      const index = pollItem.voters.findIndex((voter) =>
        this.userService.usersAreEqual(voter, user)
      );
      const voters = [...pollItem.voters];
      if (index === -1) {
        voters.push({ ...toUserRef(user), timestamp: Date.now(), points: newPoints });
      } else {
        voters[index] = { ...voters[index], points: newPoints };
      }
      await updateDoc(pollItemDoc, { voters });
    } finally {
      this.pointAllocationInFlight = false;
    }
  }

  async resetMyPoints(
    pollId: string,
    pollItems: PollItem[],
    user: User
  ): Promise<void> {
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    const itemsToReset = pollItems.filter((pollItem) =>
      pollItem.voters.some((voter) => this.userService.usersAreEqual(voter, user))
    );
    await Promise.all(
      itemsToReset.map((pollItem) => {
        const voters = pollItem.voters.map((voter) =>
          this.userService.usersAreEqual(voter, user)
            ? { ...voter, points: 0 }
            : voter
        );
        return updateDoc(doc(pollItemsCollection, pollItem.id), {
          voters,
        });
      })
    );
  }

  // Owner-triggered wipe of every voter's *points* across every item in the poll —
  // voters[] membership (who voted for what) is left untouched, only the `points`
  // weights are zeroed, so this never un-votes anyone.
  async resetAllPointVotes(
    pollId: string,
    pollItems: PollItem[]
  ): Promise<void> {
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    await Promise.all(
      pollItems.map((pollItem) => {
        const voters = pollItem.voters.map((voter) => ({ ...voter, points: 0 }));
        return updateDoc(doc(pollItemsCollection, pollItem.id), {
          voters,
        });
      })
    );
  }

  async setDescription(pollId: string, pollItemId: string, description: string) {
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    const pollItemDoc = doc(pollItemsCollection, pollItemId);
    await updateDoc(pollItemDoc, { description });
  }

  async removePollItemFS(pollId: string, pollItemId: string) {
    const pollItemsCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    await deleteDoc(doc(pollItemsCollection, pollItemId));
  }

  getPollUrl(pollId: string): string {
    const u = this.document.location.href.split("/");
    return `${u[0]}//${u[2]}/poll/${pollId}`;
  }

  toggleVisible(pollId: string, pollItem: PollItem, visible: boolean) {
    updateDoc(
      doc(
        collection(this.firestore, `polls/${pollId}/pollItems`),
        pollItem.id
      ),
      { visible }
    );
  }

  toggleSelected(pollId: string, pollItem: PollItem, selected: boolean) {
    updateDoc(
      doc(
        collection(this.firestore, `polls/${pollId}/pollItems`),
        pollItem.id
      ),
      { selected }
    );
  }

  saveSuggestion(pollId: string, pollItem: PollItem, text: string, order: number | null) {
    updateDoc(
      doc(
        collection(this.firestore, `polls/${pollId}/pollItems`),
        pollItem.id
      ),
      { suggestionAI: { text, order } }
    );
  }

  private async addVoteFS(
    pollItemDoc: DocumentReference,
    pollItem: PollItem,
    user: User
  ) {
    await updateDoc(pollItemDoc, {
      voters: [...pollItem.voters, { ...toUserRef(user), timestamp: Date.now() }],
    });
  }

  private async removeVoteFS(
    pollItemDoc: DocumentReference,
    pollItem: PollItem,
    user: User
  ) {
    const index = pollItem.voters.findIndex((voter) =>
      this.userService.usersAreEqual(user, voter)
    );
    const voters = [...pollItem.voters];
    voters.splice(index, 1);
    await updateDoc(pollItemDoc, { voters });
  }

  private getNewMoviePollItem$(
    pollId: string,
    movieId: number,
    order: number
  ): Observable<Readonly<Omit<PollItem, "pollId">>> {
    return this.tmdbService.loadCombinedMovie(movieId).pipe(
      map((_movie) => {
        const newPollItem: Omit<PollItem, "pollId"> = {
          id: this.uniqueId(pollId),
          name: this.getMovieTitle(_movie),
          created: Date.now().toString(),
          voters: [],
          movieId: movieId,
          // movie: movie, // TODO: Try to figure this out later, seems that this makes a poll to large
          movieIndex: this.tmdbService.movie2MovieIndex(_movie),
          moviePollItemData: this.tmdbService.movie2MoviePollItemData(_movie),
          creator: toUserRef(this.userService.getUser()),
          order,
        };
        return newPollItem;
      })
    );
  }

  getSimplifiedNewMoviePollItem(movie: TMDbMovie | Movie): MoviePollItemTemplate {
    return {
      name: this.getMovieTitle(movie),
      created: Date.now().toString(),
      voters: [],
      movieId: movie.id,
      // movie: movie, // TODO: Try to figure this out later, seems that this makes a poll to large
      // movieIndex: this.tmdbService.movie2MovieIndex(_movie),
      moviePollItemData: {
        id: movie.id,
        title: movie.title,
        originalTitle: (movie as TMDbMovie).original_title || (movie as Movie).originalTitle,
        tagline: movie.tagline,
        overview: movie.overview,
        director: "-",
        productionCountry: "-",
        runtime: movie.runtime,
        releaseDate: (movie as TMDbMovie).release_date || (movie as Movie).releaseDate,
        posterPath: (movie as TMDbMovie).poster_path || (movie as Movie).posterPath,
        backdropPath: (movie as TMDbMovie).backdrop_path || (movie as Movie).backdropPath,
        tmdbRating: (movie as TMDbMovie).vote_average || (movie as Movie).tmdbRating,
      },
      creator: toUserRef(this.userService.getUser()),
    };
  }

  private uniqueId(pollId): string {
    const pollCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    return doc(pollCollection).id;
  }
}
