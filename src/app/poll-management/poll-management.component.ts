import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import * as fbObservable from '@firebase/util';
import { Subscription } from 'rxjs/Rx';
import { Poll, PollItem, PollThemesEnum, User } from '../../model/poll';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatSnackBar } from '@angular/material';
import * as firebase from 'firebase/app';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { UserService } from '../user.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/do';
import { ShareDialogComponent } from '../share-dialog/share-dialog.component';

@Component({
  selector: 'poll-management-component',
  templateUrl: './poll-management.component.html',
  styleUrls: ['./poll-management.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollManagementComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  pollId$: Observable<string>;
  polls$: Observable<Poll[]>;
  showLogin: boolean;
  user$: Observable<User>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private readonly afs: AngularFirestore,
    private userService: UserService,
    private cd: ChangeDetectorRef,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,

  ) {
    this.pollCollection = afs.collection<Poll>('polls');
    this.user$ = this.userService.user$.map(user => {
      if (user !== undefined && user.id !== undefined) {
        return user;
      }
      return undefined;
    });
  }

  ngOnInit() {
    this.polls$ = this.user$.filter(user => user !== undefined)
      .switchMap(
        (user) => this.afs.collection('polls', ref => ref.where('owner.id', '==', user.id)).valueChanges() as Observable<Poll[]>
      );
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: poll.id, name: poll.name }
    });
  }
  
  removeClicked(poll: Poll) {
    let snackBarRef = this.snackBar.open(`Do you want to remove poll: ${poll.name}?`, 'Remove');
    snackBarRef.onAction().subscribe(() => {
      this.snackBar.open('Removing...', undefined, {duration: 2000});
      this.pollCollection.ref.get().then((query) => {
        query.docs.forEach((doc) => {
          doc.ref.get().then(ref => {
            const snapShotPoll = ref.data() as Poll;
            if (snapShotPoll.id === poll.id) {
              this.pollCollection.doc(doc.id).delete().then(() => {
                this.snackBar.open('Removed!', undefined, {duration: 2000});
              });
            }
          });
        });
      });
    })
  }

  login() {
    this.userService.login();
  }

  navigateToPoll(poll: Poll) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  ngOnDestroy() {
  }
}
