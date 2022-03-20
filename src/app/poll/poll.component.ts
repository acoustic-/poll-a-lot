import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { ActivatedRoute, Router, ParamMap } from "@angular/router";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import {
  Subscription,
  Observable,
  from,
  BehaviorSubject,
  combineLatest,
  NEVER,
} from "rxjs";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { PushNotificationService } from "ng-push-notification";
import { fadeInOut } from "../shared/animations";

import { Poll, PollItem, User } from "../../model/poll";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { FormControl } from "@angular/forms";
import { TMDbMovie, TMDbSeries } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { PollOptionDialogComponent } from "../poll-option-dialog/poll-option-dialog.component";
import {
  map,
  switchMap,
  find,
  tap,
  skip,
  debounceTime,
  filter,
  distinctUntilChanged,
} from "rxjs/operators";
import { isEqual } from "lodash";

@Component({
  selector: "app-poll",
  templateUrl: "./poll.component.html",
  styleUrls: ["./poll.component.scss"],
  animations: [fadeInOut],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<Array<PollItem & { hasVoted: boolean }> | undefined>;
  user$: Observable<User>;
  user: User | undefined;
  addingItem$ = new BehaviorSubject<boolean>(false);

  movieControl: FormControl;
  seriesControl: FormControl;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  newPollItemName = "";
  pushPermission = from(this.pushNotifications.requestPermission());

  subs = NEVER.subscribe();

  private changeSubscription: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private readonly afs: AngularFirestore,
    private userService: UserService,
    private cd: ChangeDetectorRef,
    private meta: Meta,
    private snackBar: MatSnackBar,
    private pushNotifications: PushNotificationService,
    private dialog: MatDialog,
    private tmdbService: TMDbService
  ) {
    this.pollCollection = afs.collection<Poll>("polls");

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

    this.user$ = this.userService.user$;

    this.movieControl = new FormControl();
    this.seriesControl = new FormControl();
  }

  ngOnInit() {
    this.poll$ = this.route.paramMap.pipe(
      switchMap((params: ParamMap) => {
        const id = params.get("id");
        return this.afs
          .collection("polls", (ref) => ref.where("id", "==", id).limit(1))
          .valueChanges()
          .pipe(
            map((array: Poll[]) => {
              if (array.length) {
                const poll = array[0];

                return poll;
              }
              return undefined;
            }),
            tap((poll) => {
              if (poll) {
                if (this.changeSubscription) {
                  this.changeSubscription.unsubscribe();
                }

                this.changeSubscription = this.pushPermission
                  .pipe(
                    filter((permission) => !!permission),
                    switchMap(() => this.pollItems$),
                    skip(1)
                  )
                  .subscribe(() =>
                    this.pushNotifications.show(
                      "Some just voted, check the poll!",
                      {
                        icon: "https://poll-a-lot.firebaseapp.com/assets/img/content-background-900x900.png",
                      },
                      6000 // close delay.
                    )
                  );

                this.subs.add(this.changeSubscription);
              }
            })
          ) as Observable<Poll | undefined>;
      }),
      distinctUntilChanged(isEqual)
    );

    this.pollItems$ = this.poll$.pipe(
      filter((poll) => !!poll),
      map((poll) => poll.id),
      switchMap((id) =>
        combineLatest([
          this.pollCollection.doc(id).valueChanges(),
          this.userService.userSubject,
        ]).pipe(
          map(
            ([pollItems, user]: [
              { pollItems: PollItem[] },
              User | undefined
            ]) => {
              return pollItems.pollItems.map((pollItem) => ({
                ...pollItem,
                hasVoted: pollItem.voters.some((voter) =>
                  this.userService.usersAreEqual(voter, user)
                ),
              }));
            }
          )
        )
      )
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
      this.getUserOrOpenLogin(() =>
        this.pollItemClick(poll, pollItems, pollItem)
      )
    ) {
      if (this.canVote(poll, _pollItems, pollItem)) {
        this.vote(poll.id, _pollItems, pollItem);
      } else {
        if (this.hasVoted(pollItem)) {
          this.removeVote(poll.id, _pollItems, pollItem);
        } else {
          this.snackBar.open("You've already voted!", undefined, {
            duration: 5000,
          });
        }
      }
    }
    this.cd.markForCheck();
  }

  vote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach((item) => {
      if (item.id === pollItem.id) {
        item.voters.push(this.user);
      }
    });
    this.pollCollection
      .doc(pollId)
      .update({ pollItems: pollItems })
      .then(() => {
        this.snackBar.open("You just voted. Thanks!", undefined, {
          duration: 5000,
        });
      });
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
    this.pollCollection
      .doc(pollId)
      .update({ pollItems: pollItems })
      .then(() => {
        // gtag('vote', 'removed_vote');
        this.snackBar.open(
          "Your vote was removed from: " + pollItem.name + ".",
          undefined,
          { duration: 5000 }
        );
      });
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

  sortPollItems(a: PollItem, b: PollItem): number {
    if (a.voters.length > b.voters.length) {
      return -1;
    }
    if (a.voters.length < b.voters.length) {
      return 1;
    }
    return 0;
  }

  getUserOrOpenLogin(cp?: () => void): User | undefined {
    let user;
    this.user$.subscribe((u) => (user = u));
    if (user) {
      this.user = user;
      return user;
    } else {
      this.userService.openLoginDialog();
      this.userService.user$
        .pipe(
          find((user) => user !== undefined),
          tap(() => {
            if (cp) {
              cp();
            }
          })
        )
        .subscribe();
      return undefined;
    }
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: poll.id, name: poll.name },
    });
  }

  trackById(index, item: PollItem) {
    return item.id;
  }

  addNewItems(): void {
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
      !this.getUserOrOpenLogin(() => this.addPollItem(poll, pollItems, name))
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
        const id = this.afs.createId();
        const newPollItem: PollItem = {
          id: id,
          name: name,
          voters: [],
          creator: this.userService.getUser(),
        };
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
      });
    }
  }

  addMoviePollItem(
    poll: Poll,
    pollItems: PollItem[],
    movie: TMDbMovie,
    movieId: number
  ): void {
    if (
      !this.getUserOrOpenLogin(() =>
        this.addMoviePollItem(poll, pollItems, movie, movieId)
      )
    ) {
      return;
    }
    if (poll.pollItems.find((pollItem) => pollItem.movieId === movieId)) {
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
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
        this.searchResults$.next([]);
      });
    }
  }

  addSeriesPollItem(
    poll: Poll,
    pollItems: PollItem[],
    series: TMDbSeries,
    seriesId: number
  ): void {
    if (
      !this.getUserOrOpenLogin(() =>
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
        const id = this.afs.createId();
        const newPollItem: PollItem = {
          id: id,
          name: series.original_name,
          voters: [],
          seriesId: seriesId,
          creator: this.userService.getUser(),
        };
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
        this.seriesSearchResults$.next([]);
      });
    }
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
        this.closeAddNewItems();
      });
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

  removePollItem(poll: Poll, pollItem: PollItem): void {
    const snack = this.snackBar.open(
      `Would you like to remove ${
        pollItem.name ? pollItem.name : "the chosen option"
      }?`,
      "Remove",
      { duration: 5000 }
    );
    snack.onAction().subscribe(() => {
      this.pollCollection
        .doc(poll.id)
        .ref.get()
        .then((poll) => {
          poll.ref.get().then((pollRef) => {
            const pollItems: PollItem[] = pollRef
              .data()
              .pollItems.filter((item) => item.id !== pollItem.id);
            pollRef.ref.update({ pollItems: pollItems }).then(() => {
              this.snackBar.open("Poll item removed!", undefined, {
                duration: 5000,
              });
            });
          });
        });
    });
  }

  reaction(
    poll: Poll,
    pollItems: PollItem[],
    {
      pollItem,
      reaction,
      removeReactions,
    }: { pollItem: PollItem; reaction: string; removeReactions?: string[] }
  ) {
    if (
      !this.getUserOrOpenLogin(() =>
        this.reaction(poll, pollItems, { pollItem, reaction, removeReactions })
      )
    ) {
      return;
    }
    const user = this.user;
    // remove reactions
    let updatedReactions = (pollItem.reactions || []).map((r) =>
      (removeReactions || []).includes(r.label)
        ? {
            label: r.label,
            users: r.users.filter((u) => !this.userService.isCurrentUser(u)),
          }
        : r
    );
    // add or remove current
    const removeReaction = updatedReactions.some(
      (r) =>
        r.label === reaction &&
        r.users.some((u) => this.userService.isCurrentUser(u))
    );

    // Remove, Add to existing or aad new
    if (updatedReactions.some((r) => r.label === reaction)) {
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

    this.pollCollection.doc(poll.id).update({ pollItems: updatedPollItems });
    this.cd.markForCheck();
  }

  setDescription(
    poll: Poll,
    pollItems: PollItem[],
    { pollItem, description }: { pollItem: PollItem; description: string }
  ) {
    const updatedPollItems: PollItem[] = [
      ...pollItems.map((item) =>
        item.id === pollItem.id ? { ...item, description } : item
      ),
    ];
    this.pollCollection.doc(poll.id).update({ pollItems: updatedPollItems });
    this.cd.markForCheck();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
