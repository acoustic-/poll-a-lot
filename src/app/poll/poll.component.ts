import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  afterNextRender,
  Pipe,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { ActivatedRoute, ParamMap } from "@angular/router";
import { Observable, BehaviorSubject, NEVER, from } from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { fadeInOut } from "../shared/animations";

import { Poll, PollItem, PollSuggestion } from "../../model/poll";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { UntypedFormControl } from "@angular/forms";
import { Movie, TMDbMovie, TMDbSeries } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { PollOptionDialogComponent } from "../poll-option-dialog/poll-option-dialog.component";
import {
  switchMap,
  tap,
  debounceTime,
  filter,
  distinctUntilChanged,
  first,
  map,
} from "rxjs/operators";
import { PollItemService } from "../poll-item.service";
import { AddMovieDialog } from "../movie-poll-item/add-movie-dialog/add-movie-dialog";
import { User } from "../../model/user";
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  updateDoc,
} from "@angular/fire/firestore";
import { defaultDialogOptions } from "../common";
import { EditPollDialogComponent } from "./edit-poll-dialog/edit-poll-dialog.component";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { CdkDragDrop, moveItemInArray } from "@angular/cdk/drag-drop";
import { getPollMovies, SEEN } from "../movie-poll-item/movie-helpers";
import _IsEqual from "lodash.isequal";
import { GeminiService } from "../gemini.service";
import {
  PollDescriptionSheet,
  PollDescriptionData,
} from "./poll-description-dialog/poll-description-dialog";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { isDefined } from "../helpers";

@Pipe({
  name: "totalDuration",
  pure: true,
  standalone: true
})
export class TotalDurationPipe {
  transform(pollItems: PollItem[], useSeenReactions: boolean): string {
    if (!pollItems) return "0 minutes";
    const selectedMovies = pollItems.filter(item => item.selected);
    const visibleDuration = () => pollItems
      .filter(item => (useSeenReactions ? !(item.reactions?.some(r => r.label === SEEN && r.users.length > 0)) : true))
      .filter(item => item.visible !== false)
      .map(item => item.moviePollItemData.runtime || 0)
      .reduce((sum, duration) => sum + duration, 0);
    const selectedDuration = () => selectedMovies
      .map(item => item.moviePollItemData.runtime || 0)
      .reduce((sum, duration) => sum + duration, 0);
    const duration = selectedDuration() > 0 ? selectedDuration() : visibleDuration();
    return `${ selectedMovies.length ? 'Selected' : 'Duration'}: ${duration} minutes ~ ${Math.floor(duration / 60)} h ${duration % 60} min`;
  }
}

@Pipe({
  name: "totalVotes",
  pure: true,
  standalone: true
})
export class TotalVotesPipe {
  transform(pollItems: PollItem[]): number {
    if (!pollItems) return 0;
    return pollItems
      .map(item => Array.isArray(item.voters) ? item.voters.length : 0)
      .reduce((sum, votes) => sum + votes, 0);
  }
}

@Pipe({
  name: "totalPollItems",
  pure: true,
  standalone: true
})
export class TotalPollItemsPipe {
  transform(pollItems: PollItem[] = [], useSeenReactions: boolean): number {
    return pollItems
      .filter(isDefined)
      .filter(item => (useSeenReactions ? !(item.reactions?.some(r => r.label === SEEN && r.users.length > 0)) : true))
      .filter(item => item.visible !== false)
      .reduce((count, item) => ++count, 0);
  }
}

@Component({
    selector: "app-poll",
    templateUrl: "./poll.component.html",
    styleUrls: ["./poll.component.scss"],
    animations: [fadeInOut],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PollComponent implements OnInit, OnDestroy {
  pollId$: Observable<string | undefined>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<PollItem[]>;
  user$ = new BehaviorSubject<User | undefined>(undefined);
  addingItem$ = new BehaviorSubject<boolean>(false);
  watchedMoviesCount$: Observable<number>;

  favorite$: Observable<boolean>;

  seriesControl: UntypedFormControl;
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  newPollItemName = "";

  useCondensedMovieView = false;
  hideWatchedMovies = false;
  draggable = false;

  hasVoted = this.pollItemService.hasVoted;
  getPollMovies = getPollMovies;

  subs = NEVER.subscribe();

  private pollCollection;
  private previousSuggestions: PollSuggestion[] | undefined;

  sortType$ = new BehaviorSubject<
    | "smart"
    | "regular"
    | "score-desc"
    | "score-asc"
    | "title"
    | "release-desc"
    | "release-asc"
    | "ranked"
  >("smart");

  get user() {
    return this.user$.getValue();
  }

  constructor(
    public userService: UserService,
    private route: ActivatedRoute,
    private meta: Meta,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private bottomsheet: MatBottomSheet,
    private tmdbService: TMDbService,
    private firestore: Firestore,
    private gemini: GeminiService,
    public pollItemService: PollItemService,
    private analytics: Analytics
  ) {
    this.pollCollection = collection(this.firestore, "polls");

    this.meta.addTag({
      name: "description",
      content:
        "Poll creation made easy. Instant. Mobile. Share the way you want!",
    });
    afterNextRender(() => {
      this.meta.addTag({ name: "og:title", content: "Poll-A-Lot" });
      this.meta.addTag({ name: "title", content: "Poll-A-Lot" });
      this.meta.addTag({ name: "og:url", content: window.location.href });
      this.meta.addTag({
        name: "og:description",
        content: "Poll creation made easy.",
      });
      this.meta.addTag({
        name: "og:image",
        content:
          location.hostname +
          "/assets/img/poll-a-lot-" +
          Math.floor(Math.random() * 7 + 1) +
          ".png",
      });
      this.meta.addTag({ name: "og:type", content: "webpage" });

      this.useCondensedMovieView =
        JSON.parse(localStorage?.getItem("condensed_poll_view")) || false;

      this.hideWatchedMovies =
        JSON.parse(localStorage?.getItem("hide_watched_movied_poll_view")) ||
        false;
    });

    this.subs.add(
      this.userService.user$.subscribe((user) => this.user$.next(user))
    );

    this.seriesControl = new UntypedFormControl();
  }

  ngOnInit() {
    this.pollId$ = this.route.paramMap.pipe(
      map((params: ParamMap) => params.get("id")),
      distinctUntilChanged()
    );

    this.poll$ = this.pollId$
      .pipe(
        switchMap((pollId) => {
          const ref = doc(this.pollCollection, pollId);
          return docData(ref, { idField: "id" }).pipe(
            filter(isDefined),
            tap((poll: Poll) => {
              // Set current poll as recent poll
              this.userService.setRecentPoll(poll);

              // Set sort type
              if (poll.useSeenReaction === false) {
                this.sortType$.next("regular");
              } else if (poll.movieList || poll.rankedMovieList) {
                this.sortType$.next("ranked");
              }
            })
          );
        }),
        distinctUntilChanged(_IsEqual)
      )
      .pipe(
        // TODO: Remove this when there are no longer "old" poll
        tap((poll) => this.checkPollCompability(poll))
      );

    this.pollItems$ = this.pollId$.pipe(
      switchMap(
        (pollId) =>
          collectionData(
            collection(this.firestore, `polls/${pollId}/pollItems`),
            { idField: "id" }
          ) as Observable<PollItem[]>
      ),
      // distinctUntilChanged(_IsEqual),
      distinctUntilChanged(
        (a, b) =>
          JSON.stringify(a).split("").sort().join("") ===
          JSON.stringify(b).split("").sort().join("")
      )
    );

    this.watchedMoviesCount$ = this.pollItems$.pipe(
      map((pollItems) =>
        pollItems.reduce(
          (total, current) =>
            current.reactions?.some(
              (r) => r.label === SEEN && r.users.length > 0
            )
              ? ++total
              : total,
          0
        )
      )
    );

    this.favorite$ = this.poll$.pipe(
      switchMap((poll) =>
        this.userService.favoritePolls$.pipe(
          map((favorites) =>
            favorites.some((favorite) => favorite.id === poll.id)
          )
        )
      )
    );

    this.subs.add(
      this.seriesControl.valueChanges
        .pipe(
          debounceTime(700),
          distinctUntilChanged(),
          switchMap((searchString) =>
            searchString?.length > 0
              ? this.tmdbService.searchSeries(searchString)
              : []
          )
        )
        .subscribe((results) => this.seriesSearchResults$.next(results))
    );

    this.poll$
      .pipe(first())
      .subscribe((poll) =>
        logEvent(this.analytics, "poll_loaded", {
          type: poll.moviepoll
            ? "movie"
            : poll.seriesPoll
            ? "series"
            : "general",
          pollId: poll.id,
        })
      );
  }

  async pollItemClick(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }

    logEvent(this.analytics, "pollitem_vote", {
      type: poll.moviepoll ? "movie" : poll.seriesPoll ? "series" : "general",
      pollId: poll.id,
      pollItem: pollItem.id,
    });

    await this.pollItemService.vote(
      poll.id,
      pollItem,
      pollItems,
      poll.selectMultiple
    );
  }

  getBgWidth(pollItems: PollItem[], pollItem: PollItem): string {
    if (pollItem && pollItems) {
      const allVotes = pollItems.reduce((count, current) => {
        return count + current.voters.length;
      }, 0);
      const votes = pollItem.voters.length;
      const percentage = (allVotes > 0 ? votes / allVotes : 0) * 100;
      return `${percentage}`;
    }
  }

  shareClicked(poll: Poll): void {
    this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id: poll.id, name: poll.name, pollDescription: poll.description },
    });
  }

  addNewItems(poll: Poll, pollItems: PollItem[]): void {
    if (
      !this.userService.getUserOrOpenLogin(() => {
        this.addNewItems(poll, pollItems);
      })
    ) {
      return;
    }
    if (poll.moviepoll) {
      const addMovieDialog = this.dialog.open(AddMovieDialog, {
        ...defaultDialogOptions,
        data: {
          pollData: {
            poll,
            pollItems,
          },
          movieIds: pollItems.map((p) => p.movieId),
        },
      });
      addMovieDialog
        .afterClosed()
        .pipe(filter((p) => !!p))
        .subscribe((movie) => this.addMoviePollItem(poll, pollItems, movie));
      return;
    }
    this.newPollItemName = "";
    this.addingItem$.next(true);
  }

  closeAddNewItems(): void {
    this.newPollItemName = "";
    this.addingItem$.next(false);
  }

  addPollItem(poll: Poll, pollItems: PollItem[], name: string): void {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addPollItem(poll, pollItems, name)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.name === name)) {
      this.snackBar.open(
        "This options already exists. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const ref = this.snackBar.open(
        `Are you sure you want to add ${name ? name : "this option"}?`,
        "Add",
        { duration: 5000 }
      );
      ref.onAction().subscribe(() => {
        const newPollItem: Omit<PollItem, "pollId"> = {
          id: this.uniqueId(),
          name: name,
          created: Date.now().toString(),
          voters: [],
          creator: this.userService.getUser(),
          order: pollItems.length,
        };
        this.pollItemService.addPollItemFS(poll.id, newPollItem);
      });
    }
  }

  async addMoviePollItem(
    poll: Poll,
    pollItems: PollItem[],
    movie: TMDbMovie | Movie
  ) {
    if (poll.locked) {
      return;
    }
    (
      await this.pollItemService.addMoviePollItem(
        movie,
        poll.id,
        pollItems.map((pollItem) => pollItem.movieId),
        false,
        true
      )
    )
      .pipe(
        filter((p) => !!p),
        tap(() => this.clearDescriptionAI(poll.id)),
        tap((p) =>
          logEvent(this.analytics, "pollitem_add", {
            type: "movie",
            pollId: poll.id,
            name: p.name,
            movieId: p.movieId,
          })
        )
      )
      .subscribe(() => {
        // this.searchResults$.next([]);
        this.dialog.closeAll();
      });
  }

  addSeriesPollItem(
    poll: Poll,
    pollItems: PollItem[],
    series: TMDbSeries,
    seriesId: number
  ): void {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addSeriesPollItem(poll, pollItems, series, seriesId)
      )
    ) {
      return;
    }
    if (pollItems.find((pollItem) => pollItem.seriesId === seriesId)) {
      this.snackBar.open(
        "You already have this on the list. Add something else!",
        undefined,
        { duration: 5000 }
      );
    } else {
      const ref = this.snackBar.open(
        `Are you sure you want to add ${
          series.original_name ? series.original_name : "this option"
        }?`,
        "Add",
        { duration: 5000 }
      );
      ref.onAction().subscribe(() => {
        const newPollItem: PollItem = {
          id: this.uniqueId(),
          pollId: poll.id,
          name: series.original_name,
          created: Date.now().toString(),
          voters: [],
          seriesId: seriesId,
          creator: this.userService.getUser(),
          order: pollItems.length,
        };
        this.pollItemService.addPollItemFS(poll.id, newPollItem);
        this.closeAddNewItems();
        this.seriesSearchResults$.next([]);
      });
    }
  }

  drawRandom(poll: Poll, pollItems: PollItem[]): void {
    const random = pollItems[Math.floor(Math.random() * pollItems.length)];
    let dialogRef = this.dialog.open(PollOptionDialogComponent, {
      data: random,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.removePollItem(poll, result, pollItems);
      }
    });
  }

  editPoll(poll: Poll) {
    let bottomSheet = this.bottomsheet.open(EditPollDialogComponent, {
      data: poll,
    });

    bottomSheet
      .afterDismissed()
      .pipe(
        first(),
        filter((poll) => !!poll)
      )
      .subscribe(async (updatedPoll) => {
        await updateDoc(doc(this.pollCollection, poll.id), {
          name: updatedPoll.name,
          description: updatedPoll.description || null,
          date: updatedPoll.date || null,
          allowAdd: updatedPoll.allowAdd || false,
          showPollItemCreators: updatedPoll.showPollItemCreators || false,
          useSeenReaction: updatedPoll.useSeenReaction || false,
          movieList: updatedPoll.movieList || false,
          rankedMovieList: updatedPoll.rankedMovieList || false,
          locked: updatedPoll.locked || null,
        });
      });
  }

  removePollItem(poll: Poll, pollItem: PollItem, pollItems: PollItem[]): void {
    const isPollItemOwner =
      pollItem.creator.id !== this.user.id
        ? `This was added by '${pollItem.creator.name}'.`
        : "";
    const snack = this.snackBar.open(
      `Do you want to remove ${
        pollItem.name ? pollItem.name : "the chosen option"
      }? ${isPollItemOwner}`,
      "Remove",
      { duration: 5000 }
    );
    from(snack.onAction())
      .pipe(
        tap(() =>
          this.pollItemService
            .removePollItemFS(poll.id, pollItem.id)
            .then(() => {
              this.clearDescriptionAI(poll.id);
              this.snackBar.open("Poll item removed!", undefined, {
                duration: 5000,
              });
            })
        ),
        tap(() =>
          logEvent(this.analytics, "pollitem_remove", {
            type: poll.moviepoll
              ? "movie"
              : poll.seriesPoll
              ? "series"
              : "general",
            pollId: poll.id,
          })
        )
      )
      .subscribe();
  }

  async setDescription(
    pollId: string,
    pollItemId: string,
    description: string
  ) {
    await this.pollItemService.setDescription(pollId, pollItemId, description);
  }

  setCondensedViewState(value: boolean) {
    this.useCondensedMovieView = value;
    localStorage.setItem("condensed_poll_view", JSON.stringify(value));
  }

  setWatchedMoviedViewState(value: boolean) {
    this.hideWatchedMovies = value;
    localStorage.setItem(
      "hide_watched_movied_poll_view",
      JSON.stringify(value)
    );
  }

  drop(event: CdkDragDrop<string[]>, poll: Poll, pollItems: PollItem[]) {
    moveItemInArray(pollItems, event.previousIndex, event.currentIndex);

    pollItems.forEach((pollItem, index) => {
      if (event.currentIndex < event.previousIndex) {
        if (index >= event.currentIndex && index <= event.previousIndex) {
          updateDoc(
            doc(
              collection(this.firestore, `polls/${poll.id}/pollItems`),
              pollItem.id
            ),
            { order: index }
          );
        }
      } else {
        if (index >= event.previousIndex && index <= event.currentIndex) {
          updateDoc(
            doc(
              collection(this.firestore, `polls/${poll.id}/pollItems`),
              pollItem.id
            ),
            { order: index }
          );
        }
      }
    });
  }

  reaction(poll: Poll, pollId: string, pollItem: PollItem, reaction: string) {
    if (poll.locked) {
      this.snackBar.open("⏰ Poll voting closed!", null, { duration: 3000 });
      return;
    }
    logEvent(this.analytics, "pollitem_reaction", {
      type: poll.moviepoll ? "movie" : poll.seriesPoll ? "series" : "general",
      pollId: poll.id,
      pollItem: pollItem.id,
    });
    this.pollItemService.reaction(pollId, pollItem, reaction);
  }

  async descriptionButtonClick(poll: Poll, pollItems: PollItem[]) {
    let description = poll.descriptionAI;
    const selectedMovies = pollItems.some(item => item.selected);
    let bottomSheet = this.bottomsheet.open(PollDescriptionSheet, {
      data: {
        description,
        pollName: poll.name,
        pollId: poll.id,
        pollItems,
        simple: selectedMovies,
        suggestions: this.previousSuggestions,
      } as PollDescriptionData,
    });

    if (!poll.descriptionAI) {
      const filteredPollItems = pollItems
        .filter(
          (pollItem) =>
            !pollItem.reactions?.some(
              (r) => r.label === SEEN && r.users.length > 0
            )
        )
        .filter((pollItem) => pollItem.visible !== false);
      description = await this.generateDescriptionAI(poll, filteredPollItems);
      bottomSheet.instance.data.description = description;
    }

    this.bottomsheet._openedBottomSheetRef
      .afterDismissed()
      .subscribe((results) => (this.previousSuggestions = results));
  }

  toggleVisible(pollId: Poll["id"], pollItem: PollItem, visible: boolean) {
    this.clearDescriptionAI(pollId);
    this.pollItemService.toggleVisible(pollId, pollItem, visible);
  }

  toggleSelected(pollId: Poll["id"], pollItem: PollItem, selected: boolean) {
    this.pollItemService.toggleSelected(pollId, pollItem, selected);
    this.clearDescriptionAI(pollId);
  }

  toggleFavorite(poll: Poll) {
    console.log("toggle favorite", poll.name);
    if (!this.userService.getUserOrOpenLogin(() => this.toggleFavorite(poll))) {
      return;
    }
    this.userService.toggleFavoritePoll(poll);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private async generateDescriptionAI(poll: Poll, pollItems: PollItem[]) {
    if (!poll.moviepoll) {
      return;
    }

    const selectedMovies = pollItems.filter(item => item.selected).map(item => item.name);

    let description = '';
    if (selectedMovies.length) {
      const aiDescription = await this.gemini.generateSelectedMoviesDescription(poll.name, poll.description, selectedMovies);
      description = `
      ## Selected movies

      ${ aiDescription }
      `;
    } else {
      const movieTitles = pollItems.filter((item) => item.visible !== false).map((item) => item.name);
      description = await this.gemini.generateMoviePollDescription(
        poll.name,
        poll.description,
        movieTitles
     );

    }

    // Save generated description
    await updateDoc(doc(this.pollCollection, poll.id), {
      descriptionAI: description,
    });

    return description;
  }

  private async clearDescriptionAI(pollId: Poll["id"]) {
    await updateDoc(doc(this.pollCollection, pollId), {
      descriptionAI: null,
    });
  }

  private uniqueId(): string {
    const pollCollection = collection(this.firestore, "polls");
    return doc(pollCollection).id;
  }

  // TODO: This was added during major poll data format refactoring to ensuge backwards compability
  // When "old" poll are obsole, this code can be removed
  private checkPollCompability(poll: Poll) {
    // Check if poll is compatible with new pollitem format
    if ((poll as any).pollItems) {
      const pollItems: PollItem[] = (poll as any).pollItems;
      const ref = this.snackBar.open(
        `This poll needs to be migrated into new Poll format.`,
        "Migrate",
        { duration: 5000 }
      );
      ref.onAction().subscribe(async () => {
        // Add each pollitem into doc/pollItems sub collecation
        pollItems.forEach(async (pollItem) => {
          await this.pollItemService.addPollItemFS(poll.id, pollItem, false);
        });
        await updateDoc(doc(this.pollCollection, poll.id), { pollItems: null });
      });
    }
  }
}
