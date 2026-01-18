import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { MovieScoreComponent } from "../movie-poll-item/movie-score/movie-score.component";
import { WatchListMarker } from "../watch-list-marker/watch-list-marker.component";
import { CommonModule } from "@angular/common";
import { LazyLoadImageModule } from "ng-lazyload-image";
import {
  FullscreenOverlayContainer,
  OverlayContainer,
  OverlayModule,
} from "@angular/cdk/overlay";
import { MatIconModule } from "@angular/material/icon";

@Component({
    selector: "poster",
    templateUrl: "./poster.component.html",
    styleUrls: ["./poster.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
    ],
    imports: [
        CommonModule,
        MovieScoreComponent,
        WatchListMarker,
        LazyLoadImageModule,
        OverlayModule,
        MatIconModule
    ]
})
export class PosterComponent {
  @Input() movieId: number | undefined;
  @Input() posterPath: string | undefined;
  @Input() rating: number | undefined;
  @Input() showWatchlistMarker = false;
  @Input() hideBorder = false;
  @Input() size: "xxs" | "xs" | "s" | "m" | "l" | "grid";
  @Input() fit = false;
  @Input() allowFullscreen = false;
  @Output() movieClicked = new EventEmitter<{}>();

  fullscreen = false;
}
