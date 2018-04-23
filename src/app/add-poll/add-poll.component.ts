import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import { Observable } from 'rxjs/Observable';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Poll, PollItem, PollThemesEnum, User } from '../../model/poll';
import { AngularFireAuth } from 'angularfire2/auth';
import * as firebase from 'firebase/app';
import { UserService } from '../user.service';
import { ShareDialogComponent } from '../share-dialog/share-dialog.component';
import { Meta } from '@angular/platform-browser';
import { MatDialog } from '@angular/material';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-add-poll',
  templateUrl: './add-poll.component.html',
  styleUrls: ['./add-poll.component.scss']
})
export class AddPollComponent implements OnInit {

  private pollCollection: AngularFirestoreCollection<Poll>;
  polls: Observable<Poll[]>;
  poll: Poll;

  user$: Observable<User>;


  loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  loading$ = this.loadingSubject.asObservable();

  constructor(
    private readonly afs: AngularFirestore,
    private afAuth: AngularFireAuth,
    private userService: UserService,
    private dialog: MatDialog,
    private router: Router,
    private meta: Meta,
  ) {
    this.pollCollection = afs.collection<Poll>('polls');
    this.polls = this.pollCollection.valueChanges();
    this.user$ = this.userService.user$.map(user => {
      const id = afs.createId();
      this.poll = {
        id: id,
        name: '',
        owner: user,
        created: new Date(),
        pollItems: [],
        theme: PollThemesEnum.default,
        selectMultiple: false,
      };

      this.loadingSubject.next(false);

      this.meta.addTag({name: 'description', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
      this.meta.addTag({name: 'og:title', content: 'Poll-A-Lot'});
      this.meta.addTag({name: 'og:url', content: window.location.href });
      this.meta.addTag({name: 'og:description', content: 'Poll creation made easy.'});
      this.meta.addTag({name: 'og:image', content: location.hostname + '/assets/img/poll-a-lot-' + Math.floor((Math.random() * 7) + 1) + '.png'});
      this.meta.addTag({name: 'og:type', content: 'webpage'});

      return user;
    });

  }

  ngOnInit() {
  }

  addPollItem(name: string): void {
    const id = this.afs.createId();
    this.poll.pollItems.push({ id: id, name: name, voters: [] })
  }

  remove(pollItem: PollItem): void {
    const index = this.poll.pollItems.findIndex(x => x.id === pollItem.id);
    this.poll.pollItems.splice(index, 1);
  }

  removePollItem(id: string): void {
    const index: number = this.poll.pollItems.findIndex(x => x.id === id);
    this.poll.pollItems.splice(index, 1);
  }

  changeTheme(theme: PollThemesEnum): void {
    this.poll.theme = theme;
  }

  toggleSelectMultiple(): void {
    this.poll.selectMultiple = !this.poll.selectMultiple;
  }

  save() {
    this.loadingSubject.next(true);
    this.pollCollection.add(this.poll).then(() => {
      this.loadingSubject.next(false);
      this.pollCollection.doc(this.poll.id).set({ pollItems: this.poll.pollItems }).then(() => {
        this.openShareDialog();
      });
    });
    gtag('config', environment.analytics, {'action': 'create_poll'});
  }

  login() {
    this.userService.login();
  }

  openShareDialog(): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: this.poll.id, name: this.poll.name }
    });

    dialogRef.afterClosed().subscribe(result => {
      this.router.navigate([`/poll/${this.poll.id}`]);
    });
  }

  saveActive(): boolean {
    return this.poll.name.length > 0 
      && this.poll.pollItems.length > 0 
      && this.poll.pollItems.find(x => !x.name || x.name.length === 0) === undefined;
  }
}
