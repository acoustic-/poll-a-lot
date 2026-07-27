import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { PosterComponent } from "../poster/poster.component";
import { MovieSearchResultView } from "../../model/tmdb";

@Component({
    selector: "movie-search-result",
    templateUrl: "./movie-search-result.component.html",
    styleUrls: ["./movie-search-result.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, PosterComponent]
})
export class MovieSearchResultComponent {
  @Input() movie: MovieSearchResultView;
}
