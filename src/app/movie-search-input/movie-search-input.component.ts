import { CommonModule } from "@angular/common";
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormControl,
} from "@angular/forms";
import {
  MatAutocompleteModule,
  MatAutocompleteTrigger,
} from "@angular/material/autocomplete";
import { MatDividerModule } from "@angular/material/divider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  NEVER,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap,
  throttleTime,
} from "rxjs";
import { RecentSearchItem, TMDbMovie } from "../../model/tmdb";
import { LetterboxdSeenInfo } from "../../model/letterboxd";
import { TMDbService } from "../tmdb.service";
import { MovieSearchResultComponent } from "../movie-search-result/movie-search-result.component";
import { MatInputModule } from "@angular/material/input";
import { MatAutocompleteOptionsScrollDirective } from "../mat-auto-complete-scroll.directive";
import { SuggestMovieButtonComponent } from "../suggest-movie-button/suggest-movie-button.component";
import { MovieDialogService } from "../movie-dialog.service";
import { ClickOutsideDirective } from "../click-outside.directive";
import { RecentSearchesService } from "../recent-searches.service";
import { UserService } from "../user.service";
import { LetterboxdService } from "../letterboxd.service";


@Component({
    selector: "movie-search-input",
    imports: [
        CommonModule,
        MatFormFieldModule,
        MatInputModule,
        MatAutocompleteModule,
        MatDividerModule,
        MatIconModule,
        FormsModule,
        ReactiveFormsModule,
        MovieSearchResultComponent,
        MatAutocompleteOptionsScrollDirective,
        SuggestMovieButtonComponent,
        ClickOutsideDirective
    ],
    templateUrl: "./movie-search-input.component.html",
    styleUrl: "./movie-search-input.component.scss"
})
export class MovieSearchInputComponent implements OnInit, OnDestroy {
  @Input() pollMovieNames: string[];
  @Input() pollMovieIds: number[];
  @Input() confirmSuggestion = false;
  @Input() rounded = false;
  @Input() pollName?: string;
  @Input() pollDescription?: string;
  @Input() useMiniMode?: string;
  @Input() size: "s" | "m" = "m"
  @Input() darkMode = false;
  @Input() recentSearchCount = 6;
  @Output() movieSelected = new EventEmitter<TMDbMovie>();

  @ViewChild("searchInput") searchInputEl: ElementRef<HTMLInputElement>;
  @ViewChild("searchFormField", { read: ElementRef }) searchFormFieldEl: ElementRef<HTMLElement>;
  @ViewChild(MatAutocompleteTrigger) autocompleteTrigger: MatAutocompleteTrigger;

  loadMoreResults$ = new Subject();
  movieControl: UntypedFormControl;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);
  hoverState$ = new BehaviorSubject<boolean>(false);
  open$ = new BehaviorSubject<boolean>(false);
  recentSearches$: BehaviorSubject<RecentSearchItem[]>;

  // Private, viewer-only "already seen" lookup for whatever's currently
  // showing in the dropdown — same call as the poll-item badge, just scoped
  // to search/recent results instead of a poll's roster.
  letterboxdSeenMap$: Observable<Map<number, LetterboxdSeenInfo>>;

  subs = NEVER.subscribe();

  constructor(
    private tmdbService: TMDbService,
    private movieDialog: MovieDialogService,
    private recentSearches: RecentSearchesService,
    private snackBar: MatSnackBar,
    private userService: UserService,
    private letterboxdService: LetterboxdService
  ) {
    this.movieControl = new UntypedFormControl();
    this.recentSearches$ = this.recentSearches.recentSearches$;

    this.letterboxdSeenMap$ = combineLatest([
      this.searchResults$,
      this.recentSearches$,
      this.userService.letterboxdMember$,
    ]).pipe(
      switchMap(([searchResults, recentSearches, member]) => {
        if (!member) {
          return of(new Map<number, LetterboxdSeenInfo>());
        }
        const tmdbIds = [...new Set([...searchResults, ...recentSearches].map((m) => m.id))];
        return this.letterboxdService.getRelationships(member.lid, tmdbIds).pipe(
          map((record) => new Map(Object.entries(record).map(([id, info]) => [Number(id), info])))
        );
      })
    );
  }

  ngOnInit() {
    this.subs.add(
      this.movieControl.valueChanges
        .pipe(
          debounceTime(700),
          distinctUntilChanged(),
          switchMap((searchString) => {
            let currentPage = 1;
            this.searchResults$.next([]);
            return this.loadMoreResults$.asObservable().pipe(
              startWith(currentPage),
              throttleTime(5000),
              map(() => ({ searchString, currentPage })),
              tap(() => currentPage++)
            );
          }),
          switchMap(({ searchString, currentPage }) =>
            searchString?.length > 0
              ? this.tmdbService
                  .searchMovies(searchString, currentPage)
                  .pipe(
                    map((results) =>
                      currentPage > 1
                        ? [...this.searchResults$.getValue(), ...results]
                        : results
                    )
                  )
              : []
          )
          // TODO: Consider this
          // map((movies) =>
          //   movies.filter((movie) => !this.pollMovieIds.includes(movie.id))
          // )
        )
        .subscribe((results) => this.searchResults$.next(results))
    );

    this.listenForViewportShifts();
  }

  movieClicked(movie: TMDbMovie) {
    this.movieSelected.emit(movie);
  }

  searchResultClicked(movie: TMDbMovie, event: Event) {
    // The autocomplete panel renders inside .container (not portaled to
    // document.body), so without this, the click bubbles up to .container's own
    // (click)="openClick()" — reopening the panel via its own delayed-open timer as
    // a side effect of the very click meant to select and close it.
    event.stopPropagation();
    this.recentSearches.add(movie);
    this.autocompleteTrigger?.closePanel();
    this.searchInputEl?.nativeElement.blur();
    this.openClick(false);
    this.movieClicked(movie);
  }

  clearHistory(event: Event) {
    event.stopPropagation();
    const snapshot = this.recentSearches$.getValue();
    this.recentSearches.clear();
    this.snackBar
      .open("Search history cleared", "Undo", { duration: 5000 })
      .onAction()
      .subscribe(() => this.recentSearches.restore(snapshot));
  }

  openMovieDialog(movie: TMDbMovie) {
    const openedMovieDialog = this.movieDialog.openMovie({
      movie,
      isVoteable: false,
      editable: false,
      movieId: movie.id,
      addMovie: true,
      currentMovieOpen: false,
      filterMovies: this.pollMovieIds,
      parent: true,
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.movieClicked(movie);
      });
  }

  onScroll() {
    this.loadMoreResults$.next({});
  }

  openClick(state = true) {
    const wasOpen = this.open$.getValue();
    this.hoverState$.next(state);
    this.open$.next(state);
    this.clearSearch();

    if (!state || !this.recentSearches$.getValue().length) {
      return;
    }

    if (this.useMiniMode && !wasOpen) {
      // The mini-mode pill is still animating its CSS width transition (collapsed ->
      // expanded) when we get here; opening the panel before it finishes anchors the
      // overlay to the still-collapsed box, so it renders at the collapsed position.
      // Wait for the transition to actually finish instead of guessing a fixed delay.
      this.openPanelAfterExpandTransition();
    } else {
      this.searchInputEl?.nativeElement.focus();
      this.autocompleteTrigger?.openPanel();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private clearSearch() {
    this.searchResults$.next([]);
    this.movieControl.reset();
  }

  private openPanelAfterExpandTransition() {
    const formFieldEl = this.searchFormFieldEl?.nativeElement;
    if (!formFieldEl) {
      this.searchInputEl?.nativeElement.focus();
      this.autocompleteTrigger?.openPanel();
      return;
    }

    let settled = false;
    const openPanel = () => {
      if (settled) return;
      settled = true;
      formFieldEl.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(fallbackTimer);
      this.searchInputEl?.nativeElement.focus();
      this.autocompleteTrigger?.openPanel();
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === formFieldEl && event.propertyName === "width") {
        openPanel();
      }
    };
    formFieldEl.addEventListener("transitionend", onTransitionEnd);

    // Safety net: transitionend never fires for a zero-duration transition (e.g.
    // prefers-reduced-motion), so cap the wait at the CSS transition's own duration
    // rather than a guessed constant.
    const durationMs =
      parseFloat(getComputedStyle(formFieldEl).transitionDuration) * 1000 || 0;
    const fallbackTimer = setTimeout(openPanel, durationMs + 50);
  }

  private listenForViewportShifts() {
    // Mobile on-screen keyboards resize window.visualViewport without necessarily firing a
    // `scroll` event, which is the only thing MatAutocomplete's default scroll strategy
    // (CDK's RepositionScrollStrategy) listens for — so the panel can be left anchored to
    // its pre-keyboard position. Nudge it back into place via the trigger's public API.
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const reposition = () => {
      if (this.autocompleteTrigger?.panelOpen) {
        this.autocompleteTrigger.updatePosition();
      }
    };
    viewport.addEventListener("resize", reposition);
    viewport.addEventListener("scroll", reposition);
    this.subs.add(() => {
      viewport.removeEventListener("resize", reposition);
      viewport.removeEventListener("scroll", reposition);
    });
  }
}
