import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { Poll, PollItem, User } from "../../model/poll";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { Observable, forkJoin, BehaviorSubject } from "rxjs";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { filter, switchMap, take, map, mergeMap } from "rxjs/operators";

@Component({
  selector: "poll-management-component",
  templateUrl: "./poll-management.component.html",
  styleUrls: ["./poll-management.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollManagementComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  pollId$: Observable<string>;
  polls$: Observable<Poll[]>;
  showLogin: boolean;
  user$: Observable<User>;
  JSON = JSON;
  loading$ = new BehaviorSubject<boolean>(false);

  constructor(
    private router: Router,
    private readonly afs: AngularFirestore,
    private userService: UserService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.pollCollection = afs.collection<Poll>("polls");
    this.user$ = this.userService.user$.map((user) => {
      if (user !== undefined && user.id !== undefined) {
        return user;
      }
      return undefined;
    });
  }

  ngOnInit() {
    this.polls$ = this.user$.pipe(filter((user) => user !== undefined)).pipe(
      switchMap((user) =>
        (
          this.afs
            .collection("polls", (ref) =>
              ref
                .where("owner.id", "==", user.id)
                .orderBy("created", "desc")
                .limit(10)
            )
            .valueChanges() as Observable<Poll[]>
        ).pipe(
          mergeMap((polls) =>
            forkJoin(
              polls.map((poll) =>
                this.pollCollection
                  .doc(poll.id)
                  .valueChanges()
                  .pipe(
                    take(1),
                    map((pollItems: { pollItems: PollItem[] }) => ({
                      ...poll,
                      pollItems: pollItems?.pollItems || [],
                    }))
                  )
              )
            )
          )
        )
      )
    );
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: poll.id, name: poll.name },
    });
  }

  removeClicked(poll: Poll) {
    let snackBarRef = this.snackBar.open(
      `Do you want to remove poll: ${poll.name}?`,
      "Remove",
      { duration: 5000 }
    );
    snackBarRef.onAction().subscribe(() => {
      this.loading$.next(true);
      this.snackBar.open("Removing...");
      this.pollCollection.ref.get().then((query) => {
        query.docs.forEach((doc) => {
          doc.ref.get().then((ref) => {
            const snapShotPoll = ref.data() as Poll;
            if (snapShotPoll.id === poll.id) {
              this.pollCollection
                .doc(doc.id)
                .delete()
                .then(() => {
                  this.snackBar.open("Removed!", undefined, { duration: 5000 });
                  this.loading$.next(false);
                });
            }
          });
        });
      });
    });
  }

  login() {
    this.userService.login();
  }

  navigateToPoll(poll: Poll) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  getVotersString(pollItem: PollItem): string {
    return pollItem.voters.map((voter) => voter.name).join(", ");
  }

  ngOnDestroy() {}
}
