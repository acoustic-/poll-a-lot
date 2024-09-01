import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { MovieScoreComponent } from "../movie-poll-item/movie-score/movie-score.component";
import { WatchListMarker } from "../watch-list-marker/watch-list-marker.component";
import { CommonModule } from "@angular/common";
import { LazyLoadImageModule } from "ng-lazyload-image";

@Component({
  selector: "poster",
  templateUrl: "./poster.component.html",
  styleUrls: ["./poster.component.scss"],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MovieScoreComponent,
    WatchListMarker,
    LazyLoadImageModule,
  ],
})
export class PosterComponent {
  @Input() movieId: number | undefined;
  @Input() posterPath: string | undefined;
  @Input() rating: number | undefined;
  @Input() showWatchlistMarker = false;
  @Input() hideBorder: false;
  @Input() size: "xxs" | "xs" | "s" | "m" | "grid" = "m";
}
