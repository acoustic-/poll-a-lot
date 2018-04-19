import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import * as fbObservable from '@firebase/util';
import { Subscription } from 'rxjs/Rx';
import { Poll, PollItem, PollThemesEnum, User } from '../../model/poll';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import * as firebase from 'firebase/app';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
import { UserService } from '../user.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/do';

@Component({
  selector: 'app-poll',
  templateUrl: './poll.component.html',
  styleUrls: ['./poll.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  pollId$: Observable<string>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<{ pollItems: PollItem[] } | undefined>;
  authSubscription: Subscription;
  showLogin: boolean;
  user: User | undefined;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private readonly afs: AngularFirestore,
    private userService: UserService,
    private cd: ChangeDetectorRef,
    private meta: Meta,

  ) {
    this.pollCollection = afs.collection<Poll>('polls');

    this.meta.addTag({name: 'description', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
    this.meta.addTag({name: 'og:title', content: 'Poll-A-Lot'});
    this.meta.addTag({name: 'og:url', content: window.location.href });
    this.meta.addTag({name: 'og:description', content: 'Poll creation made easy.'});
    this.meta.addTag({name: 'og:image', content: '/img/poll-a-lot-' + Math.floor((Math.random() * 7) + 1) + '.png'});
    this.meta.addTag({name: 'og:type', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
  }

  ngOnInit() {
    this.poll$ = this.route.paramMap
      .switchMap((params: ParamMap) => {
        const id = params.get('id');
        return this.afs.collection('polls', ref => ref.where('id', '==', id)).valueChanges()
          .map(array => {
            if (array.length) {
              const poll = array[0];
              this.pollItems$ = this.pollCollection.doc(id).valueChanges() as Observable<{ pollItems: PollItem[] } | undefined>;
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
    });
  }

  removeVote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach(item => {
      if (item.id === pollItem.id) {
        console.log("tikiti", JSON.stringify(pollItem), JSON.stringify(pollItem.voters), this.user)
        const index = pollItem.voters.findIndex(voter => this.userAreEqual(this.user, voter));
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
    });
  }

  hasVoted(pollItem: PollItem): boolean {
    if (!this.user) {
      return false;
    }
    return pollItem.voters.find(voter => this.userAreEqual(voter, this.user)) !== undefined;
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
    this.userService.user$.subscribe(u => user = u);
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

  trackById(index, item: PollItem) {
    return item.id;
  }

  private userAreEqual(a: User, b: User): boolean {
    if (a.id && b.id) {
      return a.id === b.id && a.name === b.name;
    }
    return a.name === b.name;
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }
}
