import { Injectable } from "@angular/core";
import { Poll, PollItem } from "../model/poll";
import { TMDbMovie } from "../model/tmdb";
import { UserService } from "./user.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { MatDialog } from "@angular/material/dialog";
import { TMDbService } from "./tmdb.service";
import { first, switchMap, tap } from "rxjs/operators";

@Injectable()
export class PollItemService {
  private pollCollection: AngularFirestoreCollection<Poll>;

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private readonly afs: AngularFirestore,
    private dialog: MatDialog,
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

  async addMoviePollItem(
    poll: Poll & { id: string },
    pollItems: PollItem[],
    movie: TMDbMovie,
    newPoll = false
  ) {
    const confirm = !newPoll;
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addMoviePollItem(poll, pollItems, movie)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.movieId === movie.id)) {
      this.snackBar.open(
        "You already have this on the list. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const year = new Date(movie.release_date).getFullYear();
      const title = movie.title ? movie.title : "";
      const originalTitle = movie.original_title
        ? ` (${movie.original_title})`
        : "";

      const addItem = () => {
        return this.tmdbService.loadMovie(movie.id).pipe(
          tap((movie) => {
            const id = this.afs.createId();
            const newPollItem: PollItem = {
              id: id,
              name: `${movie.originalTitle} (${year})`,
              voters: [],
              movieId: movie.id,
              movie: movie,
              creator: this.userService.getUser(),
            };
            if (!newPoll) {
              this.saveNewPollItem(
                poll.id,
                [...pollItems, newPollItem],
                confirm
              );
              this.dialog.closeAll(); // where this belongs?
            } else {
              poll.pollItems.push(newPollItem);
            }
          })
        );
      };

      if (confirm) {
        const ref = this.snackBar.open(
          `Are you sure you want to add ${
            movie.title ? `${title}${originalTitle} (${year})` : "this option"
          }?`,
          "Add",
          { duration: 5000 }
        );
        return ref
          .onAction()
          .pipe(switchMap(() => addItem()))
          .pipe(first())
          .toPromise();
      }
      return addItem().pipe(first()).toPromise();
    }
  }
}
