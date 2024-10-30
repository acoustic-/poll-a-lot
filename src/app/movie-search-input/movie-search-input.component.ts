import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from "@angular/core";
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormControl,
} from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatFormFieldModule } from "@angular/material/form-field";
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  map,
  NEVER,
  startWith,
  Subject,
  switchMap,
  tap,
  throttleTime,
} from "rxjs";
import { TMDbMovie } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { MovieSearchResultComponent } from "../movie-search-result/movie-search-result.component";
import { MatInputModule } from "@angular/material/input";
import { MatAutocompleteOptionsScrollDirective } from "../mat-auto-complete-scroll.directive";
import { SuggestMovieButtonComponent } from "../suggest-movie-button/suggest-movie-button.component";


@Component({
  selector: "movie-search-input",
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    FormsModule,
    ReactiveFormsModule,
    MovieSearchResultComponent,
    MatAutocompleteOptionsScrollDirective,
    SuggestMovieButtonComponent
  ],
  templateUrl: "./movie-search-input.component.html",
  styleUrl: "./movie-search-input.component.scss",
})
export class MovieSearchInputComponent implements OnInit, OnDestroy {
  @Input() pollMovies: string[];
  @Output() movieSelected = new EventEmitter<TMDbMovie>();

  loadMoreResults$ = new Subject();
  movieControl: UntypedFormControl;
  searchResults$ = new BehaviorSubject<TMDbMovie[]>([]);

  subs = NEVER.subscribe();

  constructor(
    private tmdbService: TMDbService,
  ) {
    this.movieControl = new UntypedFormControl();
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
  }

  movieClicked(movie: TMDbMovie) {
    this.movieSelected.emit(movie);
  }

  onScroll() {
    this.loadMoreResults$.next({});
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private clearSearch() {
    this.searchResults$.next([]);
    this.movieControl.reset();
  }
}
