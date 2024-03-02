import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { Router } from "@angular/router";
import { Poll } from "../../model/poll";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { Observable, BehaviorSubject, NEVER } from "rxjs";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { filter, map, shareReplay, tap } from "rxjs/operators";
import { User } from "../../model/user";
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "@angular/fire/firestore";
import { Unsubscribe, onSnapshot } from "firebase/firestore";

@Component({
  selector: "poll-management-component",
  templateUrl: "./poll-management.component.html",
  styleUrls: ["./poll-management.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollManagementComponent implements OnInit, OnDestroy {
  private pollCollection;
  pollId$: Observable<string>;
  polls$ = new BehaviorSubject<Poll[]>([]);
  pollSubscription: Unsubscribe;
  showLogin: boolean;
  user$: Observable<User>;
  JSON = JSON;
  loading$ = new BehaviorSubject<boolean>(false);
  recentPolls$: Observable<{ id: string; name: string }[]>;

  subs = NEVER.subscribe();

  constructor(
    private router: Router,
    private userService: UserService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    private cd: ChangeDetectorRef
  ) {
    this.pollCollection = collection(this.firestore, "polls");
    this.user$ = this.userService.user$.pipe(
      map((user) => {
        if (user !== undefined && user.id !== undefined) {
          return user;
        }
        return undefined;
      }),
      shareReplay(1)
    );
    this.recentPolls$ = this.userService.recentPolls$;
  }

  ngOnInit() {
    this.subs.add(
      this.user$
        .pipe(filter((user) => user !== undefined))
        .pipe(
          tap(async (user) => {
            if (this.pollSubscription) {
              this.pollSubscription();
            }
            const q = query(
              this.pollCollection,
              where("owner.id", "==", user.id),
              orderBy("created", "desc"),
              limit(10)
            );

            const querySnapshot = await getDocs(q);
            let pollsTmp = [];
            querySnapshot.forEach((doc) => {
              pollsTmp.push(doc.data());
            });
            this.polls$.next(pollsTmp);

            this.pollSubscription = onSnapshot(q, (snapshot) => {
              const polls: Poll[] = [];
              snapshot.forEach((d) => polls.push(d.data() as Poll));
              this.polls$.next(polls);
            });
          })
        )
        .subscribe(() => this.cd.detectChanges())
    );
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      width: "90%",
      maxWidth: "450px",
      data: { id: poll.id, name: poll.name },
    });
  }

  removeClicked(poll: Poll) {
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
      });
    });
  }

  login() {
    this.userService.login();
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  ngOnDestroy() {
    if (this.pollSubscription) {
      this.pollSubscription();
    }

    this.subs.unsubscribe();
  }
}
