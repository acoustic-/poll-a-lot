import { Component, Input } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { TMDbMovie } from '../../../model/tmdb';
import { MatIconModule } from "@angular/material/icon";


import { BehaviorSubject, filter, map, Observable } from 'rxjs';
import { isDefined } from '../../helpers';
import { MatButtonModule } from '@angular/material/button';
import { OscarAward } from '../../../model/award';
import { AwardsService } from '../../awards.service';


@Component({
  selector: 'movie-awards',
  imports: [
    CommonModule,
    AsyncPipe,
    MatIconModule,
    MatButtonModule
],
  templateUrl: './movie-awards.component.html',
  styleUrl: './movie-awards.component.scss',
  standalone: true
})
export class MovieAwardsComponent {
  @Input() set movie(value: TMDbMovie) {
    this.movieId$.next(value.id);
  }
  @Input() set open(value: any) {
    this.showAll$.next(true);
  }
  @Input() borderColor: string = '#b546f8';

  showAll$ = new BehaviorSubject<boolean>(false);
  
  awards$: Observable<OscarAward[]>;
  wonCount$ = new BehaviorSubject<number>(0);
  nominatedCount$ = new BehaviorSubject<number>(0);
  movieId$ = new BehaviorSubject<number | undefined>(undefined);

  constructor(private awardsService: AwardsService) {
    this.awards$ = this.movieId$.pipe(
      filter(isDefined),
      map((movieId) => this.awardsService.getOscarAwardsForMovie(movieId)),
      map((awards) => {
        const wonAwards = awards.filter(a => a.won).length;
        const nominatedAwards = awards.length;
        this.wonCount$.next(wonAwards);
        this.nominatedCount$.next(nominatedAwards);
        return awards;
      })
    );
  }
}
