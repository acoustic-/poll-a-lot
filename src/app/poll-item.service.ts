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

@Injectable()
export class PollItemService {
  private pollCollection: AngularFirestoreCollection<Poll>;

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private readonly afs: AngularFirestore,
    private dialog: MatDialog
  ) {
    this.pollCollection = afs.collection<Poll>("polls");
  }

  saveNewPollItem(pollId: string, newPollItems: PollItem[]): void {
    this.pollCollection
      .doc(pollId)
      .update({ pollItems: newPollItems })
      .then(() => {
        // gtag('event', 'addNewOption');
        this.snackBar.open(
          "Added new option to the poll. Happy voting!",
          undefined,
          { duration: 5000 }
        );
      });
  }

  addMoviePollItem(
    pollId: string,
    pollItems: PollItem[],
    movie: TMDbMovie,
    movieId: number
  ): void {
    console.log("add movie poll item");
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addMoviePollItem(pollId, pollItems, movie, movieId)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.movieId === movieId)) {
      this.snackBar.open(
        "You already have this on the list. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const year = new Date(movie.release_date).getFullYear();
      const ref = this.snackBar.open(
        `Are you sure you want to add ${
          movie.original_title
            ? `${movie.original_title} (${year})`
            : "this option"
        }?`,
        "Add",
        { duration: 5000 }
      );
      ref.onAction().subscribe(() => {
        const id = this.afs.createId();
        const newPollItem: PollItem = {
          id: id,
          name: `${movie.original_title} (${year})`,
          voters: [],
          movieId: movieId,
          creator: this.userService.getUser(),
        };
        this.saveNewPollItem(pollId, [...pollItems, newPollItem]);
        this.dialog.closeAll();
      });
    }
  }
}
