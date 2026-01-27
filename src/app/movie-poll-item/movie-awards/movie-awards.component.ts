import { Component, Input } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { TMDbMovie } from '../../../model/tmdb';
import { MatIconModule } from "@angular/material/icon";

import movieAwards from '../../../assets/data/oscar-winners.json';
import movieAwards2 from '../../../assets/data/oscar-winners-v2.json';
import { BehaviorSubject, filter, map, Observable } from 'rxjs';
import { isDefined } from '../../helpers';
import { MatButtonModule } from '@angular/material/button';


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
})
export class MovieAwardsComponent {
  @Input() set movie(value: TMDbMovie) {
    this.movieId$.next(value.id);
  }

  showAll$ = new BehaviorSubject<boolean>(false);
  
  awardYears$ = new BehaviorSubject<string[]>([]);
  awards$: Observable<Map<string, any[]>>;
  wonCount$ = new BehaviorSubject<number>(0);
  nominatedCount$ = new BehaviorSubject<number>(0);
  movieId$ = new BehaviorSubject<number | undefined>(undefined);

  constructor() {
    this.awards$ = this.movieId$.pipe(
      filter(isDefined),
      map((movieId) => {
        const loadedAwards = [...movieAwards as any[], ...movieAwards2 as any[]];
        const awardsByYear: Map<string, any[]> = new Map();
        const filteredAwards = loadedAwards.filter(
          (award) => {
            return award.movies.find((m: any) => m.tmdb_id === movieId);
          }
        );
        filteredAwards.forEach(award => {
          const year = award.year;
          awardsByYear.set(year, [...(awardsByYear.get(year) || []), award]);
        });
        this.awardYears$.next(Array.from(awardsByYear.keys()).sort((a, b) => parseInt(b) - parseInt(a)));
        this.wonCount$.next(filteredAwards.reduce((count, award) => award.won ? count + 1 : count, 0));
        this.nominatedCount$.next(filteredAwards.length);
        return awardsByYear;
      }),
    );
  }
}
