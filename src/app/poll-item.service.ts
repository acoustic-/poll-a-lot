import { Injectable, Injector } from "@angular/core";
import { Poll, PollItem } from "../model/poll";
import { Movie, TMDbMovie } from "../model/tmdb";
import { UserService } from "./user.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { TMDbService } from "./tmdb.service";
import { first, switchMap, tap } from "rxjs/operators";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { ProductionCoutryPipe } from "./production-country.pipe";

@Injectable()
export class PollItemService {
  private pollCollection: AngularFirestoreCollection<Poll>;

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private readonly afs: AngularFirestore,
    private tmdbService: TMDbService,
    private creditPipe: MovieCreditPipe,
    private injector: Injector
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
    movie: Movie | TMDbMovie,
    newPoll = false,
    confirm = true
  ): Promise<Readonly<Movie>> {
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
      const _movie = movie as any;
      const year = new Date(
        _movie.releaseDate || _movie.release_date
      ).getFullYear();
      const title = movie.title ? movie.title : "";
      const originalTitle =
        _movie.originalTitle || _movie.original_title
          ? ` (${_movie.originalTitle || _movie.original_titl})`
          : "";

      const addItem = () => {
        return this.tmdbService.loadMovie(movie.id).pipe(
          tap((movie) => {
            const id = this.afs.createId();
            const newPollItem: PollItem = {
              id: id,
              name: `${movie.title} (${year})`,
              voters: [],
              movieId: movie.id,
              // movie: movie, // TODO: Try to figure this out later, seems that this makes a poll to large
              movieIndex: {
                title: movie.title,
                tmdbRating: movie.tmdbRating,
                genres: movie.originalObject.genres.map((genre) => genre.id),
                release: movie.releaseDate,
              },
              moviePollItemData: {
                title: movie.title,
                originalTitle: movie.originalTitle,
                tagline: movie.tagline,
                overview: movie.overview,
                director: this.creditPipe.transform(
                  movie,
                  "directors",
                  "string"
                ),
                productionCountry: this.injector
                  .get(ProductionCoutryPipe)
                  .transform(movie, 1),
                runtime: movie.runtime,
                releaseDate: movie.releaseDate,
                posterImagesResponsive: `https://image.tmdb.org/t/p/w92${movie.originalObject.poster_path} 200w,
                https://image.tmdb.org/t/p/w154${movie.originalObject.poster_path} 340w,
                https://image.tmdb.org/t/p/w185${movie.originalObject.poster_path} 500w,
                https://image.tmdb.org/t/p/w342${movie.originalObject.poster_path} 700w,`,
                tmdbRating: movie.tmdbRating,
              },
              creator: this.userService.getUser(),
            };
            if (newPoll === false) {
              this.saveNewPollItem(poll.id, [...pollItems, newPollItem], true);
            } else {
              poll.pollItems.push(newPollItem);
            }
          })
        );
      };

      if (confirm) {
        const ref = this.snackBar.open(
          `Are you sure you want to add ${
            movie.title ? `${title} (${year})` : "this option"
          }?`,
          "Add",
          { duration: 5000 }
        );
        return ref
          .onAction()
          .pipe(
            switchMap(() => addItem()),
            first()
          )
          .toPromise();
      } else {
        return addItem().pipe(first()).toPromise();
      }
    }
  }
}
