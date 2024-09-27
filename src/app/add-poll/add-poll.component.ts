import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";
import { Observable, BehaviorSubject, NEVER } from "rxjs";
import { Poll, PollItem, PollThemesEnum } from "../../model/poll";
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
  filter,
  first,
  map,
} from "rxjs/operators";
import { PollItemService } from "../poll-item.service";
import { User } from "../../model/user";
import { Firestore, collection, doc, setDoc } from "@angular/fire/firestore";
import { defaultDialogOptions } from "../common";

@Component({
  selector: "app-add-poll",
  templateUrl: "./add-poll.component.html",
  styleUrls: ["./add-poll.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPollComponent implements OnInit, OnDestroy {
  private pollCollection;
  poll: Poll | Omit<Poll, "id">;
  pollItems: PollItem[] = [];

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
    private userService: UserService,
    private dialog: MatDialog,
    private router: Router,
    private meta: Meta,
    private snackBar: MatSnackBar,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private cd: ChangeDetectorRef,
    private firestore: Firestore
  ) {
    this.pollCollection = collection(this.firestore, "polls");
    this.user$ = this.userService.user$.pipe(
      filter((user) => !!user),
      map((user) => {
        this.poll = {
          name: "",
          owner: user,
          created: new Date(),
          theme: PollThemesEnum.default,
          selectMultiple: true,
          allowAdd: true,
          showPollItemCreators: true,
          moviepoll: true,
          seriesPoll: false,
          useSeenReaction: true,
          description: "",
          date: null,
          movieList: false,
          rankedMovieList: false,
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
      })
    );
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

  addPollItem(pollId: string, name: string): void {
    this.pollItems.push({
      id: this.uniqueId(pollId),
      pollId,
      name: name,
      created: Date.now().toString(),
      voters: [],
      creator: this.userService.getUser(),
      order: this.pollItems.length,
    });
  }

  async addMoviePollItem(movie: TMDbMovie) {
    const newPollItem = (
      await this.pollItemService.addMoviePollItem(
        movie,
        (this.poll as Poll).id,
        this.pollItems.map((pollItem) => pollItem.movieId),
        true,
        false
      )
    )
      .pipe(
        first(),
        filter((p) => !!p)
      )
      .subscribe((newPollItem) => {
        this.pollItems.push(newPollItem);
        this.cd.markForCheck();
        this.searchResults$.next([]);
      });
  }

  addSeriesPollItem(pollId: string, series: TMDbSeries): void {
    if (this.pollItems.find((pollItem) => pollItem.seriesId === series.id)) {
      this.snackBar.open(
        "You already have this on your list. Add something else!",
        undefined,
        { duration: 2000 }
      );
    } else {
      const name = `${series.original_name}`;
      this.pollItems.push({
        id: this.uniqueId(pollId),
        pollId,
        name: name,
        created: Date.now().toString(),
        voters: [],
        seriesId: series.id,
        creator: this.userService.getUser(),
        order: this.pollItems.length,
      });
      this.seriesSearchResults$.next([]);
    }
  }

  removePollItem(id: string): void {
    const index: number = this.pollItems.findIndex((x) => x.id === id);
    this.pollItems.splice(index, 1);
  }

  changeTheme(theme: PollThemesEnum): void {
    this.poll.theme = theme;
  }

  toggleSelectMultiple(): void {
    this.poll.selectMultiple = !this.poll.selectMultiple;
  }

  save() {
    this.loadingSubject.next(true);
    const id = doc(this.pollCollection).id;
    setDoc(doc(this.pollCollection, id), { ...this.poll, id }).then((ref) => {
      this.userService.setRecentPoll({
        ...this.poll,
        id,
      });
      // Add each pollitem into doc/pollItems sub collecation
      this.pollItems.forEach(async (pollItem) => {
        await this.pollItemService.addPollItemFS(id, pollItem, false);
      });

      this.openShareDialog(id);
    });
  }

  login() {
    this.userService.login();
  }

  openShareDialog(id: string): void {
    let dialogRef = this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id, name: this.poll.name },
    });

    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate([`/poll/${id}`]);
    });
  }

  saveActive(): boolean {
    return (
      this.poll.name.length > 0 &&
      this.pollItems.length > 0 &&
      this.pollItems.find((x) => !x.name || x.name.length === 0) === undefined
    );
  }

  changeMoviePollState(state: boolean) {
    this.pollItems = [];
  }

  changeSeriesPollState(state: boolean) {
    this.pollItems = [];
  }

  private uniqueId(pollId): string {
    const pollCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    return doc(pollCollection).id;
  }
}
