import { Component, OnInit, Input, ChangeDetectionStrategy, Output, EventEmitter } from '@angular/core';
import { PollItem } from '../../model/poll';
import { Movie } from '../../model/tmdb';
import { TMDbService } from '../tmdb.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'movie-poll-item',
  templateUrl: './movie-poll-item.component.html',
  styleUrls: ['./movie-poll-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoviePollItemComponent implements OnInit {
  @Input() pollItem: PollItem;
  @Input() hasVoted: boolean = false;
  @Input() showCreator: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() progressBarWidth: number; // %
  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  movie$: Observable<Readonly<Movie>>;
  shortened = true;

  constructor(
    public movieService: TMDbService,
  ) { 
  }

  ngOnInit() {
    this.movie$ = this.movieService.loadMovie(this.pollItem.movieId);
  }

  getMetaBgColor(rating: string) {
    const ratingNumber = parseInt(rating);
    if (ratingNumber >= 61) {
      return 'green';
    } else if (ratingNumber >= 40 && ratingNumber <= 60) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  remove(pollItem: PollItem): void {
    console.log("1 remove", pollItem);
    this.onRemoved.emit(pollItem);
  }

  openImdb(imdbId: string): void {
    window.open('https://www.imdb.com/title/' + imdbId);
  }

  openTmdb(tmdbId: any): void {
    window.open('https://www.themoviedb.org/movie/' + tmdbId);
  }
}
