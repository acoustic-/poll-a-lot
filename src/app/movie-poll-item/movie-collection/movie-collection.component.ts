import { Component, Input } from '@angular/core';
import { BehaviorSubject, filter, Observable, switchMap } from 'rxjs';
import { isDefined } from '../../helpers';
import { TMDbService } from '../../tmdb.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { PosterComponent } from '../../poster/poster.component';
import { LazyLoadImageModule } from "ng-lazyload-image";


@Component({
  selector: 'movie-collection',
  imports: [CommonModule, MatButtonModule, PosterComponent, LazyLoadImageModule],
  templateUrl: './movie-collection.component.html',
  styleUrl: './movie-collection.component.scss',
  standalone: true,
})
export class MovieCollectionComponent {

  movieCollectionId$ = new BehaviorSubject<Readonly<number> | undefined>(undefined);
  movieCollection$: Observable<Readonly<any> | undefined>;
  showFullMovieCollection$ = new BehaviorSubject<boolean>(false);

  @Input() set collectionId(value: number | undefined) {
    this.movieCollectionId$.next(value);
  }

  constructor(private tmdbService: TMDbService) {
      this.movieCollection$ = this.movieCollectionId$.pipe(
      filter(isDefined),
      switchMap((collectionId) =>
        this.tmdbService.loadCollection(collectionId)
      )
    );
  }
}
