import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import { Subscription, Observable, BehaviorSubject, NEVER, from } from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { fadeInOut } from "../shared/animations";

import { Poll, PollItem } from "../../model/poll";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { UntypedFormControl } from "@angular/forms";
import { Movie, TMDbMovie, TMDbSeries } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { PollOptionDialogComponent } from "../poll-option-dialog/poll-option-dialog.component";
import {
  map,
  switchMap,
  tap,
  debounceTime,
  filter,
  distinctUntilChanged,
  first,
} from "rxjs/operators";
import { ViewportScroller } from "@angular/common";
import { PollItemService } from "../poll-item.service";
import { AddMovieDialog } from "../movie-poll-item/add-movie-dialog/add-movie-dialog";
import { User } from "../../model/user";
import {
  Firestore,
  collection,
  doc,
  docData,
  docSnapshots,
  updateDoc,
} from "@angular/fire/firestore";
import { uniqueId } from "../helpers";
import { defaultDialogOptions } from "../common";
import { EditPollDialogComponent } from "./edit-poll-dialog/edit-poll-dialog.component";

@Component({
  selector: "app-poll",
  templateUrl: "./poll.component.html",
  styleUrls: ["./poll.component.scss"],
  animations: [fadeInOut],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollComponent implements OnInit, OnDestroy {
  private pollCollection;
  poll$: Observable<Poll | undefined>; // should be only one though
  user$ = new BehaviorSubject<User | undefined>(undefined);
  addingItem$ = new BehaviorSubject<boolean>(false);

  movieControl: UntypedFormControl;
  seriesControl: UntypedFormControl;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  newPollItemName = "";

  useCondensedMovieView = false;

  subs = NEVER.subscribe();

  private changeSubscription: Subscription;

  sortType$ = new BehaviorSubject<
    "smart" | "regular" | "score" | "title" | "release"
  >("smart");

  get user() {
    return this.user$.getValue();
  }

  constructor(
    public userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    private cd: ChangeDetectorRef,
    private meta: Meta,
    private snackBar: MatSnackBar,
    // private pushNotifications: PushNotificationService,
    private dialog: MatDialog,
    private tmdbService: TMDbService,
    private scroller: ViewportScroller,
    private firestore: Firestore,
    public pollItemService: PollItemService
  ) {
    this.pollCollection = collection(this.firestore, "polls");

    this.meta.addTag({
      name: "description",
      content:
        "Poll creation made easy. Instant. Mobile. Share the way you want!",
    });
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

    this.userService.user$.subscribe((user) => this.user$.next(user));

    this.movieControl = new UntypedFormControl();
    this.seriesControl = new UntypedFormControl();
  }

  ngOnInit() {
    this.useCondensedMovieView = JSON.parse(localStorage.getItem("condensed_poll_view")) || false;
    
    this.poll$ = this.route.paramMap.pipe(
      switchMap((params: ParamMap) => {
        const id = params.get("id");
        const ref = doc(this.pollCollection, id);

        return docSnapshots(ref).pipe(
          map((data) => data.data() as Poll),
          filter((poll) => !!poll),
          tap((poll) => {
            this.userService.setRecentPoll(poll);

            if (poll.useSeenReaction === false) {
              this.sortType$.next("regular");
            }

            if (this.changeSubscription) {
              this.changeSubscription.unsubscribe();
            }

            // this.changeSubscription = this.pushPermission
            //   .pipe(
            //     filter((permission) => !!permission),
            //     switchMap(() => this.pollItems$),
            //     skip(1)
            //   )
            //   .subscribe(() =>
            //     console.log("Send a push notification..")
            //     // this.pushNotifications.show(
            //     //   "Some just voted, check the poll!",
            //     //   {
            //     //     icon: "https://poll-a-lot.firebaseapp.com/assets/img/content-background-900x900.png",
            //     //   },
            //     //   6000 // close delay.
            //     // )
            //   );

            this.subs.add(this.changeSubscription);
            return poll;
          }),
          distinctUntilChanged()
        );
      })
    );

    this.subs.add(
      this.movieControl.valueChanges
        .pipe(
          debounceTime(700),
          distinctUntilChanged(),
          switchMap((searchString) =>
            searchString?.length > 0
              ? this.tmdbService.searchMovies(searchString)
              : []
          )
        )
        .subscribe((results) => this.searchResults$.next(results))
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
  }

  pollItemClick(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    const _pollItems = pollItems.concat([]);
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.pollItemClick(poll, pollItems, pollItem)
      )
    ) {
      return;
    }
    // Check if poll has "vote multiple options" enabled, if not remove vote from pollitem
    if (!poll.selectMultiple) {
      pollItems.forEach(
        (item) =>
          (item.voters = item.voters.filter(
            (voter) => !this.userService.usersAreEqual(voter, this.user)
          ))
      );
    }
    if (this.hasVoted(pollItem)) {
      this.removeVote(poll.id, _pollItems, pollItem);
    } else {
      this.vote(poll, _pollItems, pollItem);
    }

    this.cd.markForCheck();
  }

  vote(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach((item) => {
      if (item.id === pollItem.id) {
        // If there are two users with the same nickname, add number suffix
        const sameNameUserSuffix = item.voters
          .filter((voter) => voter.name === this.user.name)
          .reduce(
            (previous, voter) =>
              (voter.useSuffix || 0) > previous ? voter.useSuffix : previous,
            0
          );

        if (sameNameUserSuffix > 0) {
          item.voters.push({
            ...this.user,
            useSuffix: sameNameUserSuffix + 1,
            timestamp: Date.now(),
          });
        } else {
          item.voters.push({ ...this.user, timestamp: Date.now() });
        }
      }
    });
    updateDoc(doc(this.pollCollection, poll.id), { pollItems: pollItems }).then(
      () => {
        this.scroller.scrollToAnchor(pollItem.id);
        this.snackBar.open("You just voted. Thanks! 🌟", undefined, {
          duration: 5000,
        });
      }
    );
  }

  removeVote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach((item) => {
      if (item.id === pollItem.id) {
        const index = pollItem.voters.findIndex((voter) =>
          this.userService.usersAreEqual(this.user, voter)
        );
        if (index >= 0) {
          item.voters.splice(index, 1);
        }
      }
    });
    updateDoc(doc(this.pollCollection, pollId), { pollItems: pollItems }).then(
      () => {
        // gtag('vote', 'removed_vote');
        this.snackBar.open(
          "Your vote was removed from: " + pollItem.name + ".",
          undefined,
          { duration: 5000 }
        );
      }
    );
  }

  hasVoted(pollItem: PollItem, viewUser: User = undefined): boolean {
    const user = viewUser ? viewUser : this.user;
    if (!user) {
      return false;
    }
    return pollItem.voters.some((voter) =>
      this.userService.usersAreEqual(voter, user)
    );
  }

  canVote(poll: Poll, pollItems: PollItem[], pollItem: PollItem): boolean {
    const voted = pollItems.some((item) => this.hasVoted(item));
    return voted ? !this.hasVoted(pollItem) && poll.selectMultiple : true;
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
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id: poll.id, name: poll.name },
    });
  }

  trackById(index, item: PollItem) {
    return item.id;
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
      this.dialog.open(AddMovieDialog, {
        ...defaultDialogOptions,
        data: {
          pollData: {
            poll,
            pollItems,
          },
          movieIds: pollItems.map((p) => p.movieId),
        },
      });
      return;
    }
    this.newPollItemName = "";
    this.addingItem$.next(true);
    this.cd.markForCheck();
  }

  closeAddNewItems(): void {
    this.newPollItemName = "";
    this.addingItem$.next(false);
    this.cd.markForCheck();
  }

  addPollItem(poll: Poll, pollItems: PollItem[], name: string): void {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.addPollItem(poll, pollItems, name)
      )
    ) {
      return;
    }
    if (poll.pollItems.find((pollItem) => pollItem.name === name)) {
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
        const newPollItem: PollItem = {
          id: uniqueId(),
          name: name,
          created: Date.now().toString(),
          voters: [],
          creator: this.userService.getUser(),
        };
        this.pollItemService.saveNewPollItem(poll.id, [
          ...pollItems,
          newPollItem,
        ]);
      });
    }
  }

  addMoviePollItem(
    poll: Poll,
    pollItems: PollItem[],
    movie: TMDbMovie | Movie
  ) {
    this.pollItemService
      .addMoviePollItem(movie, poll.id, false, true)
      .pipe(filter((p) => !!p))
      .subscribe(() => {
        this.searchResults$.next([]);
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
    if (poll.pollItems.find((pollItem) => pollItem.seriesId === seriesId)) {
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
          id: uniqueId(),
          name: series.original_name,
          created: Date.now().toString(),
          voters: [],
          seriesId: seriesId,
          creator: this.userService.getUser(),
        };
        this.pollItemService.saveNewPollItem(poll.id, [
          ...pollItems,
          newPollItem,
        ]);
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
        this.removePollItem(poll, result);
      }
    });
  }

  editPoll(poll: Poll) {
    let dialogRef = this.dialog.open(EditPollDialogComponent, {
      data: poll,
    });

    dialogRef.afterClosed().pipe(first(), filter(poll => !!poll)).subscribe(async (updatedPoll) => {
      await updateDoc(doc(this.pollCollection, poll.id), {
        name: updatedPoll.name,
        description: updatedPoll.description || null,
        date: updatedPoll.date || null,
        allowAdd: updatedPoll.allowAdd,
        showPollItemCreators: updatedPoll.showPollItemCreators,
        useSeenReaction: updatedPoll.useSeenReaction,
        movieList: updatedPoll.movieList,
        rankedMovieList: updatedPoll.rankedMovieList
      });
      this.cd.markForCheck();
    });
  }

  removePollItem(poll: Poll, pollItem: PollItem): void {
    const snack = this.snackBar.open(
      `Would you like to remove ${
        pollItem.name ? pollItem.name : "the chosen option"
      }?`,
      "Remove",
      { duration: 5000 }
    );
    from(snack.onAction())
      .pipe(
        switchMap(() =>
          docData(doc(this.pollCollection, poll.id)).pipe(
            first(),
            map((poll) => {
              const pollItems = poll.pollItems.filter(
                (item) => item.id !== pollItem.id
              );
              updateDoc(doc(this.pollCollection, poll.id), { pollItems }).then(
                () => {
                  this.snackBar.open("Poll item removed!", undefined, {
                    duration: 5000,
                  });
                }
              );
            })
          )
        )
      )
      .subscribe();
  }

  async reaction(
    poll: Poll,
    pollItems: PollItem[],
    {
      pollItem,
      reaction,
      removeReactions,
    }: { pollItem: PollItem; reaction: string; removeReactions?: string[] }
  ) {
    if (
      !this.userService.getUserOrOpenLogin(() =>
        this.reaction(poll, pollItems, { pollItem, reaction, removeReactions })
      )
    ) {
      return;
    }
    const user = this.user;
    // remove reactions
    let updatedReactions = pollItem.reactions || [];

    // Remove, Add to existing or aad new
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
    const updatedPollItems = pollItems.map((p) =>
      p.id === pollItem.id ? { ...p, reactions: updatedReactions } : p
    );

    await updateDoc(doc(this.pollCollection, poll.id), {
      pollItems: updatedPollItems,
    });
    this.cd.markForCheck();
  }

  async setDescription(
    poll: Poll,
    pollItems: PollItem[],
    { pollItem, description }: { pollItem: PollItem; description: string }
  ) {
    const updatedPollItems: PollItem[] = [
      ...pollItems.map((item) =>
        item.id === pollItem.id ? { ...item, description } : item
      ),
    ];
    await updateDoc(doc(this.pollCollection, poll.id), {
      pollItems: updatedPollItems,
    });
    this.cd.markForCheck();
  }

  setCondensedViewState(value: boolean) {
    this.useCondensedMovieView = value;
    localStorage.setItem("condensed_poll_view", JSON.stringify(value));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
