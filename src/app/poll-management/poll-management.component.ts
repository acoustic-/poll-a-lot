import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";
import { Poll } from "../../model/poll";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UserService } from "../user.service";
import { Observable, BehaviorSubject } from "rxjs";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { filter, switchMap } from "rxjs/operators";
import { User } from "../../model/user";
import { Firestore, collection, collectionData, deleteDoc, doc, limit, orderBy, query, where } from "@angular/fire/firestore";

@Component({
  selector: "poll-management-component",
  templateUrl: "./poll-management.component.html",
  styleUrls: ["./poll-management.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollManagementComponent implements OnInit, OnDestroy {
  private pollCollection;
  pollId$: Observable<string>;
  polls$: Observable<Poll[]>;
  showLogin: boolean;
  user$: Observable<User>;
  JSON = JSON;
  loading$ = new BehaviorSubject<boolean>(false);

  recentPolls$: Observable<{ id: string; name: string }[]>;

  constructor(
    private router: Router,
    private userService: UserService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private firestore: Firestore
  ) {
    this.pollCollection = collection(this.firestore, "polls");
    this.user$ = this.userService.user$.map((user) => {
      if (user !== undefined && user.id !== undefined) {
        return user;
      }
      return undefined;
    });
    this.recentPolls$ = this.userService.recentPolls$;
  }

  ngOnInit() {
    this.polls$ = this.user$.pipe(filter((user) => user !== undefined)).pipe(
      switchMap((user) => {
        const q = query(this.pollCollection, where("owner.id", "==", user.id), orderBy("created", "desc"), limit(10));
        return collectionData(q) as Observable<Poll[]>;
      }),
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
      })
    });
  }

  login() {
    this.userService.login();
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  ngOnDestroy() {}
}
