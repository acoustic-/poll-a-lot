import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import * as fbObservable from '@firebase/util';
import { Subscription } from 'rxjs/Rx';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatSnackBar, MatSnackBarConfig } from '@angular/material';
import * as firebase from 'firebase/app';
import { UserService } from '../user.service';
import { Observable } from 'rxjs/Observable';
import { PushNotificationService } from 'ng-push-notification';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/take';
import 'rxjs/add/operator/skip';

import { Poll, PollItem, PollThemesEnum, User } from '../../model/poll';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { ShareDialogComponent } from '../share-dialog/share-dialog.component';

@Component({
  selector: 'app-poll',
  templateUrl: './poll.component.html',
  styleUrls: ['./poll.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<PollItem[] | undefined>;
  user$: Observable<User>;
  user: User | undefined;

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

  ) {
    this.pollCollection = afs.collection<Poll>('polls');

    this.meta.addTag({name: 'description', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
    this.meta.addTag({name: 'og:title', content: 'Poll-A-Lot'});
    this.meta.addTag({name: 'title', content: 'Poll-A-Lot'});
    this.meta.addTag({name: 'og:url', content: window.location.href });
    this.meta.addTag({name: 'og:description', content: 'Poll creation made easy.'});
    this.meta.addTag({name: 'og:image', content: location.hostname + '/assets/img/poll-a-lot-' + Math.floor((Math.random() * 7) + 1) + '.png'});
    this.meta.addTag({name: 'og:type', content: 'webpage'});

    this.user$ = this.userService.user$;
  }

  ngOnInit() {
    this.poll$ = this.route.paramMap
      .switchMap((params: ParamMap) => {
        const id = params.get('id');
        return this.afs.collection('polls', ref => ref.where('id', '==', id)).valueChanges()
          .map(array => {
            if (array.length) {
              const poll = array[0];
              this.pollItems$ = this.pollCollection.doc(id).valueChanges().map((pollItems: {pollItems: PollItem[]}) => {
                return pollItems.pollItems.sort(this.sortPollItems);
              });
              
              if (this.changeSubscription) {
                this.changeSubscription.unsubscribe();
              }

              this.changeSubscription = this.pollItems$.skip(1).subscribe(() => {
                this.pushNotifications.requestPermission().then((show) => {
                  const notification = this.pushNotifications.show(
                    'Some just voted, check the poll!',
                    {
                      icon: 'https://poll-a-lot.firebaseapp.com/assets/img/content-background-900x900.png',
                      
                    },
                    6000, // close delay.
                  );
                });
              });
              
              return poll;
            }
            return undefined;
          }) as Observable<Poll | undefined>;
      });
  }

  pollItemClick(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    const _pollItems = pollItems.concat([]);
    if (this.getUserOrOpenLogin({poll: poll, pollItems: pollItems, pollItem: pollItem})) {
      if (this.canVote(poll, _pollItems, pollItem)) {
        console.log("can vote");
        this.vote(poll.id, _pollItems, pollItem);
      } else {
        console.log("can't vote", pollItems, pollItem)
        if (this.hasVoted(pollItem)) {
          console.log("user has voted", this.hasVoted(pollItem), JSON.stringify(pollItem.voters), this.user)
          console.log("has voted -> remove vote");
          this.removeVote(poll.id, _pollItems, pollItem);
        } else {
          this.snackBar.open("You've already voted!", undefined, {duration: 2000});
        }
      }
    }
    this.cd.markForCheck();
  }

  vote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach(item => {
      if (item.id === pollItem.id) {
        item.voters.push(this.user);
      }
    });
    console.log(pollItems);
    this.pollCollection.doc(pollId).update({ pollItems: pollItems }).then(() => {
      console.log("added vote");
      gtag('config', environment.analytics, {'action': 'voted'});
      this.snackBar.open("You've voted for: " + pollItem.name + ".", undefined, {duration: 2000});
    });
  }

  removeVote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach(item => {
      if (item.id === pollItem.id) {
        console.log("tikiti", JSON.stringify(pollItem), JSON.stringify(pollItem.voters), this.user)
        const index = pollItem.voters.findIndex(voter => this.userService.usersAreEqual(this.user, voter));
        console.log("index", index)
        if (index >= 0) {
          console.log("splice!")
          item.voters.splice(index, 1);
        }
      }
    });
    console.log("remove", pollItems)
    this.pollCollection.doc(pollId).update({ pollItems: pollItems }).then(() => {
      console.log("removed vote");
      gtag('config', environment.analytics, {'action': 'removed_vote'});
      this.snackBar.open("Your vote was removed from: " + pollItem.name + ".", undefined, {duration: 2000});
    });
  }

  hasVoted(pollItem: PollItem, viewUser: User = undefined): boolean {
    const user = viewUser ? viewUser : this.user;
    console.log("has voted")
    if (!user) {
      return false;
    }
    return pollItem.voters.find(voter => this.userService.usersAreEqual(voter, user)) !== undefined;
  }

  canVote(poll: Poll, pollItems: PollItem[], pollItem: PollItem): boolean {
    const voted = pollItems.find(item => this.hasVoted(item)) !== undefined;
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
    if (a.voters.length > b.voters.length) { return -1; };
    if (a.voters.length < b.voters.length) { return 1; };
    return 0;
  }

  getUserOrOpenLogin(cp?: {poll: Poll, pollItems: PollItem[], pollItem: PollItem}): User | undefined {
    let user;
    this.user$.subscribe(u => user = u);
    if (user) {
      this.user = user;
      return user;
    } else {
      this.userService.openLoginDialog();
      this.userService.user$.find(user => user !== undefined).do(() => {
        if (cp) {
          this.pollItemClick(cp.poll, cp.pollItems, cp.pollItem); 
        }
      }
      ).subscribe();
      return undefined;
    }
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: poll.id, name: poll.name }
    });
  }

  ngOnDestroy() {
    if (this.changeSubscription) {
      this.changeSubscription.unsubscribe();
    }
  }
}
