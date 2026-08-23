import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, Injector, runInInjectionContext, inject } from "@angular/core";
import { Router } from "@angular/router";
import { Poll, PollItem } from "../../model/poll";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import {
  Observable,
  BehaviorSubject,
  NEVER,
  combineLatest,
} from "rxjs";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import {
  filter,
  map,
  switchMap,
} from "rxjs/operators";
import { User } from "../../model/user";
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  limit,
  orderBy,
  query,
  where,
  Unsubscribe
} from "@angular/fire/firestore";
import { defaultDialogOptions } from "../common";
import { MatCard } from "@angular/material/card";
import { NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { MatIconButton, MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { PollLinkCopyComponent } from "../poll-link-copy/poll-link-copy.component";
import { MatTooltip } from "@angular/material/tooltip";
import { LoginButtonComponent } from "../login-button/login-button.component";
import { SpinnerComponent } from "../spinner/spinner.component";
import { VotersPipe } from "../voters.pipe";

@Component({
    selector: "poll-management-component",
    templateUrl: "./poll-management.component.html",
    styleUrls: ["./poll-management.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatCard, NgTemplateOutlet, MatIconButton, MatIcon, PollLinkCopyComponent, MatButton, MatTooltip, LoginButtonComponent, SpinnerComponent, AsyncPipe, VotersPipe]
})
export class PollManagementComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private userService = inject(UserService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  private pollCollection;
  polls$: Observable<Array<Poll & { pollItems: PollItem[] }>>;
  showLogin: boolean | undefined;
  user$: Observable<User | undefined>;
  JSON = JSON;
  loading$ = new BehaviorSubject<boolean>(false);
  recentPolls$: Observable<{ id: string; name: string }[]>;
  recentPollsCount = 5;
  favoritePolls$: Observable<{ id: string; name: string }[]>;
  favoritePollsIds$: Observable<string[]>;

  subs = NEVER.subscribe();

  constructor() {
    this.pollCollection = collection(this.firestore, "polls");

    this.user$ = this.userService.user$.pipe(
      map((user) => {
        if (user !== undefined && user.id !== undefined) {
          return user;
        }
        return undefined;
      }),
    );
    this.recentPolls$ = this.userService.recentPolls$;
    this.favoritePolls$ = this.userService.favoritePolls$;
    this.favoritePollsIds$ = this.favoritePolls$.pipe(map(polls => polls.map(poll => poll.id)));

    // collectionData() needs an active Angular injection context (an
    // AngularFire dev-mode warning otherwise) but these switchMap callbacks
    // run later, well after the constructor's own context has closed.
    this.polls$ = this.user$.pipe(
      filter((user) => user !== undefined),
      switchMap((user: User) => {
        return runInInjectionContext(this.injector, () => {
          const q = query(
            this.pollCollection,
            where("owner.id", "==", user.id),
            orderBy("created", "desc"),
            limit(10)
          );
          return collectionData(q);
        }) as Observable<Poll[]>;
      }),
      switchMap((polls: Poll[]) =>
        combineLatest(
          polls.map((poll) =>
            (runInInjectionContext(this.injector, () =>
              collectionData(
                collection(this.firestore, `polls/${poll.id}/pollItems`)
              )
            ) as Observable<PollItem[]>).pipe(map((pollItems: PollItem[]) => ({...poll, pollItems}) ))
          )
        )
      ),
    );
  }

  ngOnInit() {}

  shareClicked(poll: { id: Poll['id'], name: Poll['name'], description: Poll['description']}): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id: poll.id, name: poll.name, pollDescription: poll.description },
    });
  }

  removeClicked(poll: Poll, pollItems: PollItem[]) {
    let snackBarRef = this.snackBar.open(
      `Do you want to remove poll: ${poll.name}?`,
      "Remove",
      { duration: 5000 }
    );
    snackBarRef.onAction().subscribe(async () => {
      this.loading$.next(true);
      this.snackBar.open("Removing...");

      await deleteDoc(doc(this.pollCollection, poll.id)).then(() => {
        this.snackBar.open("Removed!", undefined, { duration: 5000 });
        this.loading$.next(false);
      }).then(() => {
        this.userService.removeFavoritePoll(poll.id);
        this.userService.removeRecentPoll(poll.id);
        
        pollItems.forEach(async (pollItem) => {
          await deleteDoc(
            doc(
              collection(this.firestore, `polls/${poll.id}/pollItems`),
              pollItem.id
            )
          );
        });
      });
    });
  }

  toggleFavorite(poll: Poll) {
    this.userService.toggleFavoritePoll(poll);
  }

  login() {
    this.userService.login();
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
