import { ChangeDetectorRef, Component, OnDestroy, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { Observable, BehaviorSubject, NEVER } from "rxjs";
import { Poll, PollItem, PollThemesEnum, User } from "../../model/poll";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { UserService } from "../user.service";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { Meta } from "@angular/platform-browser";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UntypedFormControl } from "@angular/forms";
import { TMDbMovie, TMDbSeries } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import {
  debounceTime,
  switchMap,
  distinctUntilChanged,
  map,
} from "rxjs/operators";
import { PollItemService } from "../poll-item.service";

@Component({
  selector: "app-add-poll",
  templateUrl: "./add-poll.component.html",
  styleUrls: ["./add-poll.component.scss"],
})
export class AddPollComponent implements OnInit, OnDestroy {
  private pollCollection: AngularFirestoreCollection<Poll>;
  polls: Observable<Poll[]>;
  poll: Poll;

  user$: Observable<User>;
  settings: boolean = false;

  loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  loading$ = this.loadingSubject.asObservable();

  movieControl: UntypedFormControl;
  seriesControl: UntypedFormControl;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  subs = NEVER.subscribe();

  constructor(
    private readonly afs: AngularFirestore,
    private afAuth: AngularFireAuth,
    private userService: UserService,
    private dialog: MatDialog,
    private router: Router,
    private meta: Meta,
    private snackBar: MatSnackBar,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private cd: ChangeDetectorRef
  ) {
    this.pollCollection = afs.collection<Poll>("polls");
    this.polls = this.pollCollection.valueChanges();
    this.user$ = this.userService.user$.map((user) => {
      const id = afs.createId();
      this.poll = {
        id: id,
        name: "",
        owner: user,
        created: new Date(),
        pollItems: [],
        theme: PollThemesEnum.default,
        selectMultiple: true,
        allowAdd: true,
        showPollItemCreators: true,
        moviepoll: true,
        seriesPoll: false,
      };

      this.loadingSubject.next(false);

      this.meta.addTag({
        name: "description",
        content:
          "Poll creation made easy. Instant. Mobile. Share the way you want!",
      });
      this.meta.addTag({ name: "og:title", content: "Poll-A-Lot" });
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

      return user;
    });

    this.movieControl = new UntypedFormControl();
    this.seriesControl = new UntypedFormControl();
  }

  ngOnInit() {
    this.subs.add(
      this.movieControl.valueChanges
        .pipe(
          debounceTime(700),
          distinctUntilChanged(),
          switchMap((searchString: any) =>
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
          switchMap((searchString: any) => {
            return searchString?.length > 0
              ? this.tmdbService.searchSeries(searchString)
              : [];
          })
        )
        .subscribe((results) => this.seriesSearchResults$.next(results))
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  addPollItem(name: string): void {
    const id = this.afs.createId();
    this.poll.pollItems.push({
      id: id,
      name: name,
      voters: [],
      creator: this.userService.getUser(),
    });
  }

  async addMoviePollItem(movie: TMDbMovie) {
    await this.pollItemService.addMoviePollItem(
      this.poll,
      this.poll.pollItems,
      movie,
      true,
      false
    );
    this.cd.markForCheck();
    this.searchResults$.next([]);
  }

  addSeriesPollItem(series: TMDbSeries): void {
    if (
      this.poll.pollItems.find((pollItem) => pollItem.seriesId === series.id)
    ) {
      this.snackBar.open(
        "You already have this on your list. Add something else!",
        undefined,
        { duration: 2000 }
      );
    } else {
      const id = this.afs.createId();
      const name = `${series.original_name}`;
      this.poll.pollItems.push({
        id: id,
        name: name,
        voters: [],
        seriesId: series.id,
        creator: this.userService.getUser(),
      });
      this.seriesSearchResults$.next([]);
    }
  }

  remove(pollItem: PollItem): void {
    const index = this.poll.pollItems.findIndex((x) => x.id === pollItem.id);
    this.poll.pollItems.splice(index, 1);
  }

  removePollItem(id: string): void {
    const index: number = this.poll.pollItems.findIndex((x) => x.id === id);
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
    this.pollCollection
      .doc(this.poll.id)
      .set(this.poll)
      .then(() => {
        this.loadingSubject.next(false);
        this.pollCollection
          .doc(this.poll.id)
          .update({ pollItems: this.poll.pollItems })
          .then(() => {
            this.openShareDialog();
          });
      });
    // gtag('event', 'add_poll');
  }

  login() {
    this.userService.login();
  }

  openShareDialog(): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      data: { id: this.poll.id, name: this.poll.name },
    });

    dialogRef.afterClosed().subscribe((result) => {
      this.router.navigate([`/poll/${this.poll.id}`]);
    });
  }

  saveActive(): boolean {
    return (
      this.poll.name.length > 0 &&
      this.poll.pollItems.length > 0 &&
      this.poll.pollItems.find((x) => !x.name || x.name.length === 0) ===
        undefined
    );
  }

  changeMoviePollState(state: boolean) {
    this.poll.pollItems = [];
  }

  changeSeriesPollState(state: boolean) {
    this.poll.pollItems = [];
  }
}
