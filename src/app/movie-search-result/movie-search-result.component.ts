import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { MatTooltipModule } from "@angular/material/tooltip";
import { PosterComponent } from "../poster/poster.component";
import { LetterboxdBadgeComponent } from "../letterboxd-badge/letterboxd-badge.component";
import { MovieSearchResultView } from "../../model/tmdb";
import { LetterboxdSeenInfo } from "../../model/letterboxd";

@Component({
    selector: "movie-search-result",
    templateUrl: "./movie-search-result.component.html",
    styleUrls: ["./movie-search-result.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, PosterComponent, LetterboxdBadgeComponent, MatTooltipModule]
})
export class MovieSearchResultComponent {
  @Input() movie: MovieSearchResultView;
  @Input() letterboxdSeen?: LetterboxdSeenInfo;
}
