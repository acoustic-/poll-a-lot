import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

import { environment } from "../environments/environment";
import {
  TMDbMovie,
  Movie,
  TMDbMovieResponse,
  WatchProviders,
} from "../model/tmdb";
import {
  AngularFirestore,
  AngularFirestoreCollection,
} from "@angular/fire/compat/firestore";
import { Observable } from "rxjs";
import { LocalCacheService } from "./local-cache.service";
import { TMDbSeries, TMDbSeriesResponse } from "../model/tmdb";
import { map, switchMap, tap, timeoutWith } from "rxjs/operators";

@Injectable()
export class TMDbService {
  private movieCollection: AngularFirestoreCollection<Movie>;
  private cacheExpiresIn = 2 * 24 * 60 * 60; // Expires in two days
  baseUrl: string;
  posterSize: string;
  backdropSize: string;
  genres: { id: number; name: string }[];

  constructor(
    private readonly afs: AngularFirestore,
    private http: HttpClient,
    private cache: LocalCacheService
  ) {
    this.movieCollection = afs.collection<Movie>("movie");
    this.loadConfig();
    this.loadGenres();
  }

  loadMovie(tmdbId: number): Observable<Readonly<Movie>> {
    const tmdbMovie$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${environment.movieDb.tmdbKey}&append_to_response=images,recommendations,key_words,credits&language=en-US&include_image_language=en,null`
      )
      .map((movie: TMDbMovie) => this.tmdb2movie(movie));

    const combinedMovie$ = tmdbMovie$.pipe(
      switchMap((movie) => this.combineWithOMDbData(movie))
    );
    const requestObservable = combinedMovie$.pipe(
      timeoutWith(1000, tmdbMovie$)
    );
    return this.cache.observable(
      `movie-id-${tmdbId}`,
      requestObservable,
      this.cacheExpiresIn
    );
  }

  loadSeries(tmdbId: number): Observable<Readonly<TMDbSeries>> {
    const tmdbSeries$ = this.http
      .get(
        `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${environment.movieDb.tmdbKey}`
      )
      .map((series: TMDbSeries) => series);
    return this.cache.observable(
      `series-id-${tmdbId}`,
      tmdbSeries$,
      this.cacheExpiresIn
    );
  }

  loadWatchProviders(tmdbId: number): Observable<Readonly<WatchProviders>> {
    const watchProviders$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${environment.movieDb.tmdbKey}`
      )
      .map((watchProviders: WatchProviders) => watchProviders);
    return this.cache.observable(
      `watch-providers-${tmdbId}`,
      watchProviders$,
      this.cacheExpiresIn
    );
  }

  searchMovies(searchString: string): Observable<TMDbMovie[]> {
    const query = searchString.replace(/\s+/g, "+").trim();
    return this.http
      .get(
        `https://api.themoviedb.org/3/search/movie?api_key=${environment.movieDb.tmdbKey}&query=${query}`
      )
      .map((response: TMDbMovieResponse) => {
        return response.results;
      });
  }

  searchSeries(searchString: string): Observable<TMDbSeries[]> {
    const query = searchString.replace(/\s+/g, "+").trim();
    return this.http
      .get(
        `https://api.themoviedb.org/3/search/tv?api_key=${environment.movieDb.tmdbKey}&query=${query}`
      )
      .map((response: TMDbSeriesResponse) => {
        return response.results;
      });
  }

  loadMovieOMDB(imdbId: string): Observable<any> {
    const request$ = this.http.get(
      `https://www.omdbapi.com?apikey=${environment.movieDb.omdbKey}&i=${imdbId}`
    );

    return this.cache.observable(
      `omdb-movie-${imdbId}`,
      request$,
      this.cacheExpiresIn
    );
  }

  combineWithOMDbData(movie: Movie): Observable<Movie> {
    return this.loadMovieOMDB(movie.imdbId).pipe(
      map((omdbMovie: any) => {
        const imdbRating = omdbMovie.Ratings
          ? omdbMovie.Ratings.find(
              (rating) => rating.Source === "Internet Movie Database"
            )
          : null;
        const metaRating = omdbMovie.Ratings
          ? omdbMovie.Ratings.find((rating) => rating.Source === "Metacritic")
          : null;
        const rottenRating = omdbMovie.Ratings
          ? omdbMovie.Ratings.find(
              (rating) => rating.Source === "Rotten Tomatoes"
            )
          : null;
        const rotten: string = rottenRating ? rottenRating.Value : null;
        const meta: string = metaRating ? metaRating.Value.split("/")[0] : null; // 10/100
        const imdb: number = imdbRating ? imdbRating.Value : null;

        return {
          ...movie,
          imdbRating: imdb,
          metaRating: meta,
          rottenRating: rotten,
          omdbMovie,
        };
      })
    );
  }

  loadGenres(): void {
    const request$ = this.http.get(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=${environment.movieDb.tmdbKey}`
    );

    this.cache
      .observable("movie-generes", request$, this.cacheExpiresIn)
      .subscribe((response: { genres: { id: number; name: string }[] }) => {
        this.genres = response.genres;
      });
  }

  getPosterPath(poster_path: string): string | null {
    return poster_path
      ? `${this.baseUrl}${this.posterSize}${poster_path}`
      : null;
  }

  getGenreNames(genres: { id: number; name: string }[]): string[] {
    return genres.map(
      (movieGenre) =>
        this.genres.find((genre) => {
          return genre.id === movieGenre.id;
        }).name
    );
  }

  loadConfig(): void {
    const request$ = this.http.get(
      `https://api.themoviedb.org/3/configuration?api_key=${environment.movieDb.tmdbKey}`
    );

    this.cache
      .observable("movie-config", request$, this.cacheExpiresIn)
      .subscribe((config: any) => {
        this.baseUrl = config.images.secure_base_url;
        this.posterSize = config.images.poster_sizes.sort()[2];
        this.backdropSize = config.images.backdrop_sizes.sort()[3];
      });
  }

  loadPopularMovies(page: number) {
    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/popular?api_key=${environment.movieDb.tmdbKey}&page=${page}`
      )
      .pipe(map((result: { results: TMDbMovie[] }) => result.results));
    return this.cache.observable(`popular-movies-${page}`, movies$, 30 * 60);
  }

  loadBestRatedMovies(page: number) {
    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/top_rated?api_key=${environment.movieDb.tmdbKey}&page=${page}`
      )
      .pipe(map((result: { results: TMDbMovie[] }) => result.results));
    return this.cache.observable(`best-rated-movies-${page}`, movies$, 30 * 60);
  }

  loadRecommendedMovies(page: number, genres: number[], prodYears: number[]) {
    const genresStr = genres.length
      ? `&with_genres=${genres.join("|")}`
      : undefined;
    let yearStr = prodYears.length
      ? `&primary_release_year=${Math.ceil(
          prodYears.reduce((cum, i) => cum + i, 0) / prodYears.length
        )}`
      : undefined;
    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/discover/movie?api_key=${environment.movieDb.tmdbKey}&page=${page}${yearStr}${genresStr}`
      )
      .pipe(
        tap((r) => console.log("recommended...", r)),
        map((result: { results: TMDbMovie[] }) => result.results)
      );
    return this.cache.observable(
      `best-recommended-movies-${page}-${genresStr}-${yearStr}`,
      movies$,
      30 * 60
    );
  }

  tmdb2movie(movie: TMDbMovie): Movie {
    return {
      posterUrl: movie.poster_path
        ? this.getPosterPath(movie.poster_path)
        : null,
      overview: movie.overview,
      releaseDate: movie.release_date,
      genres: movie.genres ? this.getGenreNames(movie.genres) : [],
      id: movie.id,
      imdbId: movie.imdb_id,
      originalTitle: movie.original_title,
      title: movie.title,
      backdropUrl: null,
      popularity: movie.popularity,
      voteCount: movie.vote_count,
      tmdbRating: movie.vote_average,
      runtime: movie.runtime,
      tagline: movie.tagline,
      originalObject: movie,
      credits: movie.credits,
      recommendations: movie.recommendations,
      productionCountries: movie.production_countries,
    };
  }
}
