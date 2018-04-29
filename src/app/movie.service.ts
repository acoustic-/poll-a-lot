import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../environments/environment';
import { TMDbMovie, Movie, TMDbMovieResponse, ExtraRating } from '../model/movie';
import { AngularFirestore, AngularFirestoreCollection } from 'angularfire2/firestore';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/timeoutWith';
import { LocalCacheService } from './local-cache.service';

@Injectable()
export class MovieService {
  private movieCollection: AngularFirestoreCollection<Movie>;
  private cacheExpiresIn = 2 * 24 * 60 * 60; // Expires in two days
  baseUrl: string;
  posterSize: string;
  backdropSize: string;
  genres: { id: number, name: string }[];

  constructor(
    private readonly afs: AngularFirestore,
    private http: HttpClient,
    private cache: LocalCacheService,
  ) {
    this.movieCollection = afs.collection<Movie>('movie');
    this.loadConfig();
    this.loadGenres();
  }

  loadMovie(movieId: number): Observable<Readonly<Movie>> {
    const tmdbMovie$ = this.http.get(
      `https://api.themoviedb.org/3/movie/${movieId}?api_key=${environment.movieDb.tmdbKey}`
    ).map((movie: TMDbMovie) => {
      console.log("resolved TMDb movie", movie);
      return {
        posterUrl: movie.poster_path ? `${this.baseUrl}${this.posterSize}${movie.poster_path}` : undefined,
        overview: movie.overview,
        releaseDate: movie.release_date,
        genres: movie.genres ? movie.genres.map((movieGenre) => this.genres.find((genre) => { return genre.id === movieGenre.id }).name) : [],
        id: movie.id,
        imdbId: movie.imdb_id,
        originalTitle: movie.original_title,
        title: movie.title,
        backdropUrl: movie.backdrop_path ? `${this.baseUrl}${this.backdropSize}${movie.backdrop_path}` : undefined,
        popularity: movie.popularity,
        voteCount: movie.vote_count,
        tmdbRating: movie.vote_average,
        runtime: movie.runtime,
      }
    });

    const combinedMovie$ = tmdbMovie$.switchMap((movie) => this.combineWithOMDbData(movie));
    const requestObservable = combinedMovie$.timeoutWith(1000, tmdbMovie$);
    return this.cache.observable(`movie-id-${movieId}`, requestObservable, this.cacheExpiresIn);
  }

  searchMovies(searchString: string): Observable<TMDbMovie[]> {
    const query = searchString.replace(/\s+/g, '+').trim();
    return this.http.get(
      `https://api.themoviedb.org/3/search/movie?api_key=${environment.movieDb.tmdbKey}&query=${query}`
    ).map((response: TMDbMovieResponse) => {
      return response.results;
    });
  }

  loadMovieOMDB(imdbId: string): Observable<any> {
    return this.http.get(
      `https://www.omdbapi.com?apikey=${environment.movieDb.omdbKey}&i=${imdbId}`
    );
  }

  combineWithOMDbData(movie: Movie): Observable<Movie> {
    console.log("built movie:", movie);
    return this.loadMovieOMDB(movie.imdbId).map((omdbMovie: any) => {
      console.log(movie, omdbMovie, omdbMovie.Ratings);
      const rotten: string = omdbMovie.Ratings.find(rating => rating.Source === "Rotten Tomatoes").Value;
      const meta: string = omdbMovie.Ratings.find(rating => rating.Source === "Metacritic").Value.split('/')[1]; // 10/100
      const imdb: number = omdbMovie.Ratings.find(rating => rating.Source === "Internet Movie Database").Value;
      return { ...movie, imdbRating: imdb, metaRating: meta, rottenRating: rotten };
    });
  }

  loadGenres(): void {
    const request$ = this.http.get(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=${environment.movieDb.tmdbKey}`
    );

    this.cache.observable('movie-generes', request$, this.cacheExpiresIn).subscribe((response: {genres: { id: number, name: string }[]}) => {
      this.genres = response.genres;
    });
  }

  loadConfig(): void {
    const request$ = this.http.get(
      `https://api.themoviedb.org/3/configuration?api_key=${environment.movieDb.tmdbKey}`
    );

    this.cache.observable('movie-config', request$, this.cacheExpiresIn).subscribe((config: any) => {
      this.baseUrl = config.images.secure_base_url;
      this.posterSize = config.images.poster_sizes.sort()[1];
      this.backdropSize = config.images.backdrop_sizes.sort()[1];
    });
  }
}
