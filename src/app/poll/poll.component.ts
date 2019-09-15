import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import { Subscription , Observable} from 'rxjs';
import { MatDialog, MatSnackBar } from '@angular/material';
import { UserService } from '../user.service';
import { PushNotificationService } from 'ng-push-notification';
import { fadeInOut } from '../shared/animations';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/take';
import 'rxjs/add/operator/skip';

import { Poll, PollItem, User } from '../../model/poll';
import { ShareDialogComponent } from '../share-dialog/share-dialog.component';
import { FormControl } from '@angular/forms';
import { TMDbMovie, TMDbSeries } from '../../model/tmdb';
import { TMDbService } from '../tmdb.service';
import { PollOptionDialogComponent } from '../poll-option-dialog/poll-option-dialog.component';
import { map, switchMap, find, tap, skip, debounceTime, filter, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-poll',
  templateUrl: './poll.component.html',
  styleUrls: ['./poll.component.scss'],
  animations: [ fadeInOut ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PollComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  poll$: Observable<Poll | undefined>; // should be only one though
  pollItems$: Observable<PollItem[] | undefined>;
  user$: Observable<User>;
  user: User | undefined;

  movieControl: FormControl;
  seriesControl: FormControl;
  searchResults$: Observable<TMDbMovie[]>;
  seriesSearchResults$: Observable<TMDbSeries[]>;

  addingItem = false;
  newPollItemName = '';

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
    private tmdbService: TMDbService,
  ) {
    this.pollCollection = afs.collection<Poll>('polls');

    this.meta.addTag({ name: 'description', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!' });
    this.meta.addTag({ name: 'og:title', content: 'Poll-A-Lot' });
    this.meta.addTag({ name: 'title', content: 'Poll-A-Lot' });
    this.meta.addTag({ name: 'og:url', content: window.location.href });
    this.meta.addTag({ name: 'og:description', content: 'Poll creation made easy.' });
    this.meta.addTag({ name: 'og:image', content: location.hostname + '/assets/img/poll-a-lot-' + Math.floor((Math.random() * 7) + 1) + '.png' });
    this.meta.addTag({ name: 'og:type', content: 'webpage' });

    this.user$ = this.userService.user$;

    this.movieControl = new FormControl();
    this.seriesControl = new FormControl();
  }

  ngOnInit() {
    this.poll$ = this.route.paramMap
      .pipe(switchMap((params: ParamMap) => {
        const id = params.get('id');
        return this.afs.collection('polls', ref => ref.where('id', '==', id)).valueChanges()
          .pipe(
            map((array: Poll[]) => {
              if (array.length) {
                const poll = array[0];
                this.pollItems$ = this.pollCollection.doc(id).valueChanges()
                  .pipe(map((pollItems: { pollItems: PollItem[] }) => {
                    return pollItems.pollItems;
                  }));

                if (this.changeSubscription) {
                  this.changeSubscription.unsubscribe();
                }

                this.changeSubscription = this.pollItems$.pipe(skip(1)).subscribe(() => {
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
            })) as Observable<Poll | undefined>
        })
      );

    this.searchResults$ = this.movieControl.valueChanges
      .pipe(
        filter(name => name && name.length > 0),
        debounceTime(700),
        distinctUntilChanged(),
        switchMap(searchString => {
          return this.tmdbService.searchMovies(searchString)
        },
      ),
    );

    this.seriesSearchResults$ = this.seriesControl.valueChanges
      .pipe(
        filter(name => name && name.length > 0),
        debounceTime(700),
        distinctUntilChanged(),
        switchMap(searchString => {
          return this.tmdbService.searchSeries(searchString)
        }
      ),
    );
  }

  pollItemClick(poll: Poll, pollItems: PollItem[], pollItem: PollItem) {
    const _pollItems = pollItems.concat([]);
    if (this.getUserOrOpenLogin({ poll: poll, pollItems: pollItems, pollItem: pollItem })) {
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
          this.snackBar.open("You've already voted!", undefined, { duration: 2000 });
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
      gtag('event', 'vote');
      this.snackBar.open("You just voted. Thanks!", undefined, { duration: 2000 });
    });
  }

  removeVote(pollId: string, pollItems: PollItem[], pollItem: PollItem) {
    pollItems.forEach(item => {
      if (item.id === pollItem.id) {
        const index = pollItem.voters.findIndex(voter => this.userService.usersAreEqual(this.user, voter));
        if (index >= 0) {
          console.log("splice!")
          item.voters.splice(index, 1);
        }
      }
    });
    console.log("remove", pollItems)
    this.pollCollection.doc(pollId).update({ pollItems: pollItems }).then(() => {
      console.log("removed vote");
      gtag('vote', 'removed_vote');
      this.snackBar.open("Your vote was removed from: " + pollItem.name + ".", undefined, { duration: 2000 });
    });
  }

  hasVoted(pollItem: PollItem, viewUser: User = undefined): boolean {
    const user = viewUser ? viewUser : this.user;
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

  getUserOrOpenLogin(cp?: { poll: Poll, pollItems: PollItem[], pollItem: PollItem }): User | undefined {
    let user;
    this.user$.subscribe(u => user = u);
    if (user) {
      this.user = user;
      return user;
    } else {
      this.userService.openLoginDialog();
      this.userService.user$.pipe(
        find(user => user !== undefined),
        tap(() => {
          if (cp) {
            this.pollItemClick(cp.poll, cp.pollItems, cp.pollItem);
          }
        }
      )).subscribe();
      return undefined;
    }
  }

  shareClicked(poll: Poll): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: poll.id, name: poll.name }
    });
  }

  trackById(index, item: PollItem) {
    return item.id;
  }

  addNewItems(): void {
    this.newPollItemName = '';
    this.addingItem = true;

    this.cd.markForCheck();
  }

  closeAddNewItems(): void {
    this.newPollItemName = '';
    this.addingItem = false;

    this.cd.markForCheck();
  }

  addPollItem(poll: Poll, pollItems: PollItem[], name: string): void {
    if (poll.pollItems.find(pollItem => pollItem.name === name)) {
      this.snackBar.open('This options already exists. Add something else!', undefined, {duration: 2000});
    } else {
      const ref = this.snackBar.open(`Are you sure you want to add ${ name ? name : 'this option' }?`, 'Add', {duration: 3000});
      ref.onAction().subscribe(() => {
        const id = this.afs.createId();
        const newPollItem = { id: id, name: name, voters: [] };
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
      });
    }
  }

  addMoviePollItem(poll: Poll, pollItems: PollItem[], name: string, movieId: number): void {
    if (poll.pollItems.find(pollItem => pollItem.movieId === movieId)) {
      this.snackBar.open('You already have this on the list. Add something else!', undefined, {duration: 2000});
    } else {
      const ref = this.snackBar.open(`Are you sure you want to add ${ name ? name : 'this option' }?`, 'Add', {duration: 3000});
      ref.onAction().subscribe(() => {
        const id = this.afs.createId();
        const newPollItem = { id: id, name: '', voters: [], movieId: movieId };
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
      });
    }
  }

  addSeriesPollItem(poll: Poll, pollItems: PollItem[], name: string, seriesId: number): void {
    if (poll.pollItems.find(pollItem => pollItem.seriesId === seriesId)) {
      this.snackBar.open('You already have this on the list. Add something else!', undefined, {duration: 2000});
    } else {
      const ref = this.snackBar.open(`Are you sure you want to add ${ name ? name : 'this option' }?`, 'Add', {duration: 3000});
      ref.onAction().subscribe(() => {
        const id = this.afs.createId();
        const newPollItem = { id: id, name: '', voters: [], seriesId: seriesId };
        this.saveNewPollItem(poll.id, [...pollItems, newPollItem]);
      });
    }
  }

  saveNewPollItem(pollId: string, newPollItems: PollItem[]): void {
    this.pollCollection.doc(pollId).update({ pollItems: newPollItems }).then(() => {
      gtag('event', 'addNewOption');
      this.snackBar.open("Added new option to the poll. Happy voting!", undefined, { duration: 2000 });
      this.closeAddNewItems();
    });
  }

  drawRandom(poll: Poll, pollItems: PollItem[]): void {
    const random = pollItems[Math.floor(Math.random() * pollItems.length)]
    let dialogRef = this.dialog.open(PollOptionDialogComponent, {
      data: random,
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.removePollItem(poll, result);
      }
    });
  }

  removePollItem(poll: Poll, pollItem: PollItem): void {
    const snack = this.snackBar.open(`Would you like to remove ${ pollItem.name ? pollItem.name : 'the chosen option'}?`, 'Remove', { duration: 4000 });
    snack.onAction().subscribe(() => {
      this.pollCollection.doc(poll.id).ref.get().then(poll => {
        poll.ref.get().then((pollRef) => {
          const pollItems: PollItem[] = pollRef.data().pollItems.filter(item => item.id !== pollItem.id);
          pollRef.ref.update({pollItems: pollItems}).then(() => {
            this.snackBar.open('Poll item removed!', undefined, { duration: 2000 });
          });
        });
      });
    });
  }

  ngOnDestroy() {
    if (this.changeSubscription) {
      this.changeSubscription.unsubscribe();
    }
  }
}
