import { Component, EventEmitter, Input, Output } from "@angular/core";
import { TMDbService } from "../tmdb.service";
import { GeminiService } from "../gemini.service";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { BehaviorSubject, map } from "rxjs";
import { TMDbMovie } from "../../model/tmdb";
import { AsyncPipe, CommonModule } from "@angular/common";
import { LazyLoadImageModule } from "ng-lazyload-image";

@Component({
  selector: "suggest-movie-button",
  standalone: true,
  imports: [CommonModule, AsyncPipe, LazyLoadImageModule, MatSnackBarModule],
  templateUrl: "./suggest-movie-button.component.html",
  styleUrl: "./suggest-movie-button.component.scss",
})
export class SuggestMovieButtonComponent {
  @Input() pollMovies: string[];
  @Output() movieSelected = new EventEmitter<TMDbMovie>();

  loadingSuggestions$ = new BehaviorSubject<boolean>(false);
  generatedSuggestionAI: string[] = [];

  constructor(
    private tmdbService: TMDbService,
    private geminiService: GeminiService,
    private snackBar: MatSnackBar
  ) {}

  async suggestMovie() {
    this.loadingSuggestions$.next(true);
    const loadingMsg = this.snackBar.open("Loading movie suggestions...");
    if (this.generatedSuggestionAI.length) {
    } else {
      const list = await this.geminiService.generateNewMovieSuggestionList(
        this.pollMovies
      );
      console.log(list);
      const rows = list.split("\n");
      // Remove header row
      rows.shift();
      this.generatedSuggestionAI = rows;
    }
    // Get and remove first movie
    const randomMovie = this.generatedSuggestionAI.splice(0,1) as string[];
    const movieSplit = randomMovie[0].split(",");

    this.loadingSuggestions$.next(false);

    this.tmdbService
      .searchMovies(movieSplit[0], 1, Number(movieSplit[1]))
      .pipe(map((movies) => movies[0]))
      .subscribe((movie) => this.movieSelected.next(movie));

    loadingMsg.dismiss();
  }
}
