import { Component, OnInit, Input, ChangeDetectionStrategy, Output, EventEmitter } from '@angular/core';
import { PollItem } from '../../model/poll';
import { environment } from '../../environments/environment';
import { TMDbMovieResponse, TMDbMovie, Movie, ExtraRating, TMDbSeries } from '../../model/tmdb';
import { TMDbService } from '../tmdb.service';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'series-poll-item',
  templateUrl: './series-poll-item.component.html',
  styleUrls: ['./series-poll-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesPollItemComponent implements OnInit {
  @Input() pollItem: PollItem;
  @Input() hasVoted: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  series$: Observable<Readonly<TMDbSeries>>;
  shortened = true;

  constructor(
    public tmdbService: TMDbService,
  ) { 
  }

  ngOnInit() {
    this.series$ = this.tmdbService.loadSeries(this.pollItem.seriesId).map(series => {
      return {
        ...series,
        poster_path: this.tmdbService.getPosterPath(series.poster_path)
      };
    });

    this.series$.subscribe((series) => console.log(series));
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  remove(pollItem: PollItem): void {
    console.log("1 remove", pollItem);
    this.onRemoved.emit(pollItem);
  }
}
