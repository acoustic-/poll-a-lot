import { Inject, Injectable, DOCUMENT } from "@angular/core";
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
} from "@angular/fire/firestore";
import { TMDbService } from "./tmdb.service";
import { first, switchMap, map, tap } from "rxjs/operators";
import { Observable, of } from "rxjs";
import { DocumentReference, setDoc } from "firebase/firestore";
import { User } from "../model/user";
import { getSimpleMovieTitle } from "./movie-poll-item/movie-helpers";


export type MoviePollItemTemplate = Readonly<Omit<PollItem, "id" | "pollId" | "movieIndex" | "order">>;

@Injectable()
export class PollItemService {
  private getMovieTitle = getSimpleMovieTitle;

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private tmdbService: TMDbService,
    private firestore: Firestore,
    @Inject(DOCUMENT) private document: Document
  ) {}

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
  ): Promise<Observable<Readonly<PollItem>>> {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addMoviePollItem(movie, pollId, existingMovieIds, newPoll, confirm)
      )
    ) {
      return;
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

    const addMovie = (movieIds): Observable<Readonly<PollItem>> | undefined => {
      // There are duplicates
      if (movieIds.length && checkDuplicates(movie.id, movieIds)) {
        return of(undefined);
        // Don't add to database, just return new item
      } else if (newPoll === true) {
        return this.getNewMoviePollItem$(
          pollId,
          movie.id,
          movieIds.length
        ) as any;
      } else {
        if (confirm) {
          const ref = this.snackBar.open(
            `Are you sure you want to add ${this.getMovieTitle(movie as any)}?`,
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
      // Existing movies not available, load pollitems
      return collectionData(
        collection(this.firestore, `polls/${pollId}/pollItems`)
      ).pipe(
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
                  : [...r.users, user]),
              ],
            }
          : r
      );
    } else {
      updatedReactions = [
        ...updatedReactions,
        { label: reaction, users: [user] },
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
      voters: [...pollItem.voters, { ...user, timestamp: Date.now() }],
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
          creator: this.userService.getUser(),
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
      creator: this.userService.getUser(),
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
