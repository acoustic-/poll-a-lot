import { ChangeDetectorRef, Component, OnDestroy, OnInit, ChangeDetectionStrategy, afterNextRender, inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Observable, BehaviorSubject, NEVER, combineLatest, firstValueFrom } from "rxjs";
import { Poll, PollItem, PollThemesEnum } from "../../model/poll";
import { UserService } from "../user.service";
import { ShareDialogComponent } from "../share-dialog/share-dialog.component";
import { Meta } from "@angular/platform-browser";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { TMDbMovie, TMDbSeries, WatchlistItem } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import {
  debounceTime,
  switchMap,
  distinctUntilChanged,
  filter,
  first,
  map,
  tap,
} from "rxjs/operators";
import { PollItemService } from "../poll-item.service";
import { User } from "../../model/user";
import { Firestore, collection, doc, setDoc } from "@angular/fire/firestore";
import { defaultDialogOptions } from "../common";
import { isDefined } from "../helpers";
import { toUserRef } from "../user-identity";
import { MatCard } from "@angular/material/card";
import { SpinnerComponent } from "../spinner/spinner.component";
import { MatButton } from "@angular/material/button";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatTooltip } from "@angular/material/tooltip";
import { MatFormField, MatInput, MatLabel, MatSuffix, MatHint } from "@angular/material/input";
import { MatDatepickerInput, MatDatepickerToggle, MatDatepicker } from "@angular/material/datepicker";
import { MovieSearchInputComponent } from "../movie-search-input/movie-search-input.component";
import { MatIcon } from "@angular/material/icon";
import { PosterComponent } from "../poster/poster.component";
import { MatAutocompleteTrigger, MatAutocomplete, MatOption } from "@angular/material/autocomplete";
import { MoviePollItemComponent } from "../movie-poll-item/movie-poll-item.component";
import { SeriesPollItemComponent } from "../series-poll-item/series-poll-item.component";
import { LoginButtonComponent } from "../login-button/login-button.component";
import { AsyncPipe } from "@angular/common";

const defaultPollOptions: Partial<Poll> = {
  created: new Date(),
  theme: PollThemesEnum.default,
  selectMultiple: true,
  allowAdd: true,
  showPollItemCreators: true,
  moviepoll: true,
  seriesPoll: false,
  useSeenReaction: true,
  movieList: false,
  rankedMovieList: false,
  pointVoting: { pointVoting: false },
};

@Component({
    selector: "app-add-poll",
    templateUrl: "./add-poll.component.html",
    styleUrls: ["./add-poll.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatCard, SpinnerComponent, MatButton, MatSlideToggle, MatTooltip, FormsModule, MatFormField, MatInput, MatLabel, MatDatepickerInput, MatDatepickerToggle, MatSuffix, MatDatepicker, MovieSearchInputComponent, MatIcon, PosterComponent, MatAutocompleteTrigger, ReactiveFormsModule, MatHint, MatAutocomplete, MatOption, MoviePollItemComponent, SeriesPollItemComponent, LoginButtonComponent, AsyncPipe]
})
export class AddPollComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private meta = inject(Meta);
  private snackBar = inject(MatSnackBar);
  private tmdbService = inject(TMDbService);
  private pollItemService = inject(PollItemService);
  private cd = inject(ChangeDetectorRef);
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);

  private pollCollection;
  poll: Poll | Omit<Poll, "id">;
  pollItems$ = new BehaviorSubject<PollItem[]>([]);

  user$: Observable<User>;
  settings = false;

  loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  loading$ = this.loadingSubject.asObservable();

  seriesControl: FormControl<string | null>;
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

  constructor() {
    this.pollCollection = collection(this.firestore, "polls");
    
    this.seriesControl = new FormControl<string | null>(null);

    this.user$ = this.userService.user$.pipe(
      filter(isDefined),
      distinctUntilChanged(),
      tap((user) => {
        this.poll = {
          ...this.poll,
          ...defaultPollOptions,
          owner: toUserRef(user),
        };

        this.loadingSubject.next(false);
        this.cd.markForCheck();
      }),
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

    this.user$.pipe(first()).subscribe(() => {
      const nav = this.router.currentNavigation();
      const state = nav?.extras.state;
  
      if (state && state['poll'] && state['pollItems']) {
        this.replicatePoll(state['poll'], state['pollItems']);
      }
    });
  }

  ngOnInit() {
    this.subs.add(
      this.seriesControl.valueChanges
        .pipe(
          debounceTime(700),
          distinctUntilChanged(),
          switchMap((searchString) => {
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
      this.user$.pipe(filter(isDefined)).subscribe(() => {
        const starterMovieId: TMDbMovie["id"] = Number(
          this.route.snapshot.queryParamMap.get("movieId")
        );

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

  async replicatePoll(poll: Poll, pollItems: PollItem[]) {
    const { name, description, date } = poll;
    // The datepicker input (add-poll.component.html) binds directly to
    // poll.date as a native Date, even though Poll.date's model type is the
    // Firestore Timestamp-like shape it actually has once read back from the
    // DB — Firestore's own SDK accepts a Date on write and returns
    // {seconds, nanoseconds} on read, so this is a real, harmless shape
    // change across that round-trip, not a bug.
    const assignedDate = date?.seconds
      ? (new Date(date.seconds * 1000) as unknown as Poll["date"])
      : date;

    this.poll = {...this.poll, name: `${name} [COPY]`, description, date: assignedDate};

    if (poll.moviepoll) {
      for (const pollItem of pollItems) {
        // moviePollItemData is the already-simplified (camelCase) shape this
        // very method produces via getSimplifiedNewMoviePollItem — not a real
        // TMDbMovie — but addMoviePollItem only reads title/overview/etc.
        // fields that happen to exist on both, which is what makes
        // "replicate this poll's items into a new poll" work at all here.
        await this.addMoviePollItem(pollItem.moviePollItemData as unknown as TMDbMovie);
      }
    } else if (poll.seriesPoll) {
      // TODO
    } else {
      pollItems.forEach(pollItem => this.addPollItem('id' in this.poll ? this.poll.id : null, pollItem.name));
    }
  

    this.cd.markForCheck(); 
  }

  addPollItem(pollId: string | null, name: string): void {
    const pollItems = this.pollItems$.getValue();
    this.pollItems$.next([
      ...pollItems,
      {
        id: this.uniqueId(pollId),
        pollId,
        name: name,
        created: Date.now().toString(),
        voters: [],
        creator: toUserRef(this.userService.getUser()),
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

    
    const newPollItemObs = await this.pollItemService.addMoviePollItem(
        movie,
        (this.poll as Poll).id,
        pollItems.map((pollItem) => pollItem.movieId),
        true,
        false
    );

    await firstValueFrom(
      newPollItemObs.pipe(
        first(),
        filter((p) => !!p),
        tap((newPollItem) => {       
          // Replace template placeholder poll-item
          // Add actual new poll item
          this.pollItems$.next([...pollItems.filter(p => p.id !== templateId), newPollItem]);
        })  
    ));
    this.cd.markForCheck();
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
          creator: toUserRef(this.userService.getUser()),
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
    setDoc(doc(this.pollCollection, id), { ...this.poll, id }).then(() => {
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
    const dialogRef = this.dialog.open(ShareDialogComponent, {
      ...defaultDialogOptions,
      data: { id, name: this.poll.name, pollDescription: this.poll.description },
    });

    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate([`/poll/${id}`]);
    });
  }

  saveActive(): boolean {
    if (!this.poll?.name) {
      return false;
    }
    const pollItems = this.pollItems$.getValue();
    return (
      this.poll.name.length > 0 &&
      pollItems.length > 0 &&
      pollItems.find((x) => !x.name || x.name.length === 0) === undefined
    );
  }

  changeMoviePollState() {
    this.pollItems$.next([]);
  }

  changeSeriesPollState() {
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
