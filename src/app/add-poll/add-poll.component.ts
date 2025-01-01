import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  afterNextRender,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Observable, BehaviorSubject, NEVER, combineLatest } from "rxjs";
import { Poll, PollItem, PollThemesEnum } from "../../model/poll";
import { UserService } from "../user.service";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { Meta } from "@angular/platform-browser";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { UntypedFormControl } from "@angular/forms";
import { TMDbMovie, TMDbSeries, WatchlistItem } from "../../model/tmdb";
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
import { isDefined } from "../helpers";

@Component({
  selector: "app-add-poll",
  templateUrl: "./add-poll.component.html",
  styleUrls: ["./add-poll.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPollComponent implements OnInit, OnDestroy {
  private pollCollection;
  poll: Poll | Omit<Poll, "id">;
  pollItems$ = new BehaviorSubject<PollItem[]>([]);

  user$: Observable<User>;
  settings: boolean = false;

  loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  loading$ = this.loadingSubject.asObservable();

  seriesControl: UntypedFormControl;
  seriesSearchResults$ = new BehaviorSubject<TMDbSeries[]>([]);

  watchlistItems$: Observable<WatchlistItem[]>;
  watchlistRowCount: Readonly<number>;
  showWatchlistItemsCount: Readonly<number>;

  pollMovieNames$ = this.pollItems$.pipe(
    map((pollItems) => pollItems.map((pollItem) => pollItem.name))
  );

  pollMovieIds$ = this.pollItems$.pipe(
    map((pollItems) => pollItems.map((pollItem) => pollItem.id))
  );

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
    private firestore: Firestore,
    private route: ActivatedRoute
  ) {
    this.pollCollection = collection(this.firestore, "polls");
    
    this.seriesControl = new UntypedFormControl();

    this.user$ = this.userService.user$.pipe(
      filter(isDefined),
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

        return user;
      })
    );

    afterNextRender(() => {
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
  
      this.watchlistRowCount = Math.min(
        Math.floor((window.innerWidth - 64) / (65 + 2 * 6)),
        5
      );
      this.showWatchlistItemsCount = this.watchlistRowCount;
    });
  }

  ngOnInit() {
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

    this.watchlistItems$ = combineLatest([
      this.userService.getWatchlistMovies$(),
      this.pollItems$,
    ]).pipe(
      map(([watchlistItems, pollItems]) =>
        watchlistItems.filter(
          (watchlistItem) =>
            !pollItems
              .map((p) => p.movieId)
              .includes(watchlistItem.moviePollItemData.id)
        )
      )
    );

    this.subs.add(
      this.user$.pipe(filter(isDefined)).subscribe(user => {
        const starterMovieId: TMDbMovie["id"] = Number(
          this.route.snapshot.queryParamMap.get("movieId")
        );
        this.user$

        if (starterMovieId) {
          this.tmdbService
            .loadTMDBMovie(starterMovieId)
            .subscribe((movie) => this.addMoviePollItem(movie));
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  addPollItem(pollId: string, name: string): void {
    const pollItems = this.pollItems$.getValue();
    this.pollItems$.next([
      ...pollItems,
      {
        id: this.uniqueId(pollId),
        pollId,
        name: name,
        created: Date.now().toString(),
        voters: [],
        creator: this.userService.getUser(),
        order: pollItems.length,
      },
    ]);
  }

  async addMoviePollItem(movie: TMDbMovie) {
    const pollItems = this.pollItems$.getValue();

    // Add template placeholder for movie to be added
    const templateId = 'template-id';
    const pollItemTemplate = {id: templateId, ...this.pollItemService.getSimplifiedNewMoviePollItem(movie)} as PollItem;
    this.pollItems$.next([...pollItems, pollItemTemplate]);

    const newPollItem = (
      await this.pollItemService.addMoviePollItem(
        movie,
        (this.poll as Poll).id,
        pollItems.map((pollItem) => pollItem.movieId),
        true,
        false
      )
    )
      .pipe(
        first(),
        filter((p) => !!p)
      )
      .subscribe((newPollItem) => {
        // Replace template placeholder poll-item
        // Add actual new poll item
        this.pollItems$.next([...pollItems.filter(p => p.id !== templateId), newPollItem]);
        this.cd.markForCheck();
        // this.searchResults$.next([]);
      });
  }

  addSeriesPollItem(pollId: string, series: TMDbSeries): void {
    const pollItems = this.pollItems$.getValue();
    if (pollItems.find((pollItem) => pollItem.seriesId === series.id)) {
      this.snackBar.open(
        "You already have this on your list. Add something else!",
        undefined,
        { duration: 2000 }
      );
    } else {
      const name = `${series.original_name}`;
      this.pollItems$.next([
        ...pollItems,
        {
          id: this.uniqueId(pollId),
          pollId,
          name: name,
          created: Date.now().toString(),
          voters: [],
          seriesId: series.id,
          creator: this.userService.getUser(),
          order: pollItems.length,
        },
      ]);
      this.seriesSearchResults$.next([]);
    }
  }

  removePollItem(id: string): void {
    const pollItems = this.pollItems$.getValue();
    const index: number = pollItems.findIndex((x) => x.id === id);
    pollItems.splice(index, 1);
    this.pollItems$.next(pollItems);
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
      this.pollItems$.getValue().forEach(async (pollItem) => {
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
      data: { id, name: this.poll.name, pollDescription: this.poll.description },
    });

    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate([`/poll/${id}`]);
    });
  }

  saveActive(): boolean {
    const pollItems = this.pollItems$.getValue();
    return (
      this.poll.name.length > 0 &&
      pollItems.length > 0 &&
      pollItems.find((x) => !x.name || x.name.length === 0) === undefined
    );
  }

  changeMoviePollState(state: boolean) {
    this.pollItems$.next([]);
  }

  changeSeriesPollState(state: boolean) {
    this.pollItems$.next([]);
  }

  private uniqueId(pollId): string {
    const pollCollection = collection(
      this.firestore,
      `polls/${pollId}/pollItems`
    );
    return doc(pollCollection).id;
  }
}
