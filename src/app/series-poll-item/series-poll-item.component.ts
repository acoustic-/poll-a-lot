import { Component, OnInit, Input, ChangeDetectionStrategy, Output, EventEmitter, inject } from "@angular/core";
import { PollItem } from "../../model/poll";
import { environment } from "../../environments/environment";
import {
  TMDbMovieResponse,
  TMDbMovie,
  Movie,
  ExtraRating,
  TMDbSeries,
} from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ResolvedIdentity } from "../user-identity.service";
import { MatCard } from "@angular/material/card";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MatTooltip } from "@angular/material/tooltip";
import { NgClass, AsyncPipe, DatePipe } from "@angular/common";
import { MatButton } from "@angular/material/button";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { MatIcon } from "@angular/material/icon";
import { VoterComponent } from "../voter/voter.component";
import { AvatarStackComponent } from "../avatar-stack/avatar-stack.component";

@Component({
    selector: "series-poll-item",
    templateUrl: "./series-poll-item.component.html",
    styleUrls: ["./series-poll-item.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatCard, LazyLoadImageModule, MatTooltip, NgClass, MatButton, UserAvatarComponent, MatIcon, VoterComponent, AvatarStackComponent, AsyncPipe, DatePipe]
})
export class SeriesPollItemComponent implements OnInit {
  tmdbService = inject(TMDbService);

  @Input() pollItem: PollItem;
  @Input() hasVoted: boolean = false;
  @Input() showCreator: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() voterIdentities: readonly ResolvedIdentity[] = [];
  @Input() creatorIdentity: ResolvedIdentity | undefined;
  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  series$: Observable<Readonly<TMDbSeries>>;
  shortened = true;

  ngOnInit() {
    this.series$ = this.tmdbService
      .loadSeries(this.pollItem.seriesId)
      .pipe(map((series) => {
        return {
          ...series,
          poster_path: this.tmdbService.getPosterPath(series.poster_path),
        };
      }));
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  remove(pollItem: PollItem): void {
    this.onRemoved.emit(pollItem);
  }
}
