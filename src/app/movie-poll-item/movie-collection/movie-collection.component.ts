import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { BehaviorSubject, filter, Observable, switchMap } from 'rxjs';
import { isDefined } from '../../helpers';
import { TMDbService } from '../../tmdb.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { PosterComponent } from '../../poster/poster.component';
import { LazyLoadImageModule } from "ng-lazyload-image";
import { TMDbMovie } from '../../../model/tmdb';
import { HyphenatePipe } from '../../hyphen.pipe';


@Component({
  selector: 'movie-collection',
  imports: [CommonModule, MatButtonModule, PosterComponent, LazyLoadImageModule, HyphenatePipe],
  templateUrl: './movie-collection.component.html',
  styleUrl: './movie-collection.component.scss',
  standalone: true,
})
export class MovieCollectionComponent {
  private tmdbService = inject(TMDbService);


  movieCollectionId$ = new BehaviorSubject<Readonly<number> | undefined>(undefined);
  movieCollection$: Observable<Readonly<any> | undefined>;
  showFullMovieCollection$ = new BehaviorSubject<boolean>(false);

  @Input() set collectionId(value: number | undefined) {
    this.movieCollectionId$.next(value);
  }

  @Output() openMovie = new EventEmitter<TMDbMovie>();

  constructor() {
      this.movieCollection$ = this.movieCollectionId$.pipe(
      filter(isDefined),
      switchMap((collectionId) =>
        this.tmdbService.loadCollection(collectionId)
      )
    );
  }

  openAnotherMovie(movie: TMDbMovie) {
    this.openMovie.emit(movie);
  }
}
