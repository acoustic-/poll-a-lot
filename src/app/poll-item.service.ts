import { Injectable } from "@angular/core";
import { Poll, PollItem } from "../model/poll";
import { Movie, TMDbMovie } from "../model/tmdb";
import { UserService } from "./user.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { TMDbService } from "./tmdb.service";
import { first, switchMap, map, tap } from "rxjs/operators";
import { Observable, of } from "rxjs";

@Injectable()
export class PollItemService {
  private pollCollection: AngularFirestoreCollection<Poll>;

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private readonly afs: AngularFirestore,
    private tmdbService: TMDbService
  ) {
    this.pollCollection = afs.collection<Poll>("polls");
  }

  saveNewPollItem(
    pollId: string,
    newPollItems: PollItem[],
    showSnack = true
  ): void {
    this.pollCollection
      .doc(pollId)
      .update({ pollItems: newPollItems })
      .then(() => {
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

  addMoviePollItem(
    pollId: string,
    movie: Movie | TMDbMovie,
    newPoll = false,
    confirm = true,
    pollItems = [] // Add pollItems with new poll, otherwise load existing
  ): Observable<Readonly<PollItem | undefined>> {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addMoviePollItem(pollId, movie)
      )
    ) {
      return;
    }

    const checkDuplicates = (
      _pollItems: PollItem[],
      movieId: number
    ): boolean => {
      if (_pollItems.find((pollItem) => pollItem.movieId === movieId)) {
        this.snackBar.open(
          "You already have this on the list. Add something else!",
          undefined,
          { duration: 5000 }
        );
        return true;
      }
      return false;
    };

    const getMovieTitle = (movie: Movie): string => {
      const _movie = movie as any;
      const year = new Date(
        _movie.releaseDate || _movie.release_date
      ).getFullYear();
      const title = movie.title ? movie.title : "";
      return `${movie.title} (${year})`;
    };

    const createNewMoviePollItem = (movieId: number): Observable<PollItem> => {
      return this.tmdbService.loadMovie(movieId).pipe(
        map((_movie) => {
          const id = this.afs.createId();
          const newPollItem: PollItem = {
            id: id,
            name: getMovieTitle(_movie),
            voters: [],
            movieId: movie.id,
            // movie: movie, // TODO: Try to figure this out later, seems that this makes a poll to large
            movieIndex: this.tmdbService.movie2MovieIndex(_movie),
            moviePollItemData: this.tmdbService.movie2MoviePollItemData(_movie),
            creator: this.userService.getUser(),
          };
          return newPollItem;
        })
      );
    };

    if (pollItems.length && checkDuplicates(pollItems, movie.id)) {
      return of(undefined);
    } else if (newPoll === true) {
      return createNewMoviePollItem(movie.id);
    } else {
      return this.pollCollection
        .doc(pollId)
        .get()
        .first()
        .pipe(
          map((snap) => snap?.data()?.pollItems),
          switchMap((pollItems) => {
            if (!pollItems) {
              return of(undefined);
            }

            if (checkDuplicates(pollItems, movie.id)) {
              return of(undefined);
            } else {
              const addItem = () => {
                return createNewMoviePollItem(movie.id).pipe(
                  tap((newPollItem) => {
                    this.saveNewPollItem(
                      pollId,
                      [...pollItems, newPollItem],
                      true
                    );
                  })
                );
              };

              if (confirm) {
                const ref = this.snackBar.open(
                  `Are you sure you want to add ${getMovieTitle(
                    movie as any
                  )}?`,
                  "Add",
                  { duration: 5000 }
                );
                return ref.onAction().pipe(
                  switchMap(() => addItem()),
                  first()
                );
              }
              return addItem().pipe(first());
            }
          })
        );
    }
  }
}
