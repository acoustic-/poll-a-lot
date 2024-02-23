import { Injectable, Injector } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../environments/environment";
import {
  TMDbMovie,
  Movie,
  TMDbMovieResponse,
  WatchProviders,
  WatchService,
  MoviePollItemData,
  MovieIndex,
  WatchlistItem,
} from "../model/tmdb";
import { Observable, combineLatest, of } from "rxjs";
import { LocalCacheService } from "./local-cache.service";
import { TMDbSeries, TMDbSeriesResponse } from "../model/tmdb";
import {
  concatMap,
  delay,
  map,
  retryWhen,
  switchMap,
  tap,
} from "rxjs/operators";
import { UserService } from "./user.service";
import { ProductionCoutryPipe } from "./production-country.pipe";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { LetterboxdService } from "./letterboxd.service";

@Injectable()
export class TMDbService {
  private cacheExpiresIn = 14 * 24 * 60 * 60; // Expires in two weeks
  baseUrl: string;
  posterSize: string;
  backdropSize: string;
  genres: { id: number; name: string }[];

  constructor(
    private http: HttpClient,
    private cache: LocalCacheService,
    private userService: UserService,
    private letterboxdService: LetterboxdService,
    private injector: Injector
  ) {
    this.loadConfig();
    this.loadGenres();
  }

  loadMovie(tmdbId: number): Observable<Readonly<Movie>> {
    const obs$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${environment.movieDb.tmdbKey}&append_to_response=images,recommendations,keywords,credits&language=en-US&include_image_language=en,null`
      )
      .map((movie: TMDbMovie) => this.tmdb2movie(movie));

    return this.cache.observable(
      `movie-id-${tmdbId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  loadCombinedMovie(tmdbId: number): Observable<Readonly<Movie>> {
    const combinedMovie$: Observable<Movie> = this.loadMovie(tmdbId).pipe(
      switchMap((movie) =>
        combineLatest([
          of(movie),
          this.combineWithOMDbData(movie),
          this.combineWithLetterboxdData(movie),
        ]).pipe(
          map(([movie, omdb, letterboxd]) => ({
            ...movie,
            ...omdb,
            ...letterboxd,
          }))
        )
      )
    );
    return combinedMovie$;
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
    const request$ = this.http
      .get(
        `https://www.omdbapi.com?apikey=${environment.movieDb.omdbKey}&i=${imdbId}`
      )
      .pipe(handleRetryError(500, "omdb-load"));

    return this.cache.observable(
      `omdb-movie-${imdbId}`,
      request$,
      this.cacheExpiresIn
    );
  }

  combineWithOMDbData(movie: Movie): Observable<Movie> {
    const obs$ = this.loadMovieOMDB(movie.imdbId).pipe(
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

    return this.cache.observable(
      `movie-omdb-id-${movie.id}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  combineWithLetterboxdData(movie: Movie): Observable<Movie> {
    const obs$ = this.letterboxdService.getFilm(movie.id).pipe(
      map((lbMovie: any) => ({
        ...movie,
        letterboxdRating: lbMovie?.rating,
        letterboxdItem: lbMovie,
      }))
    );

    return this.cache.observable(
      `movie-letterboxd-id-${movie.id}`,
      obs$,
      this.cacheExpiresIn
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

  loadMovieProviders(region: string): Observable<WatchService[]> {
    const request$ = this.http
      .get(
        `https://api.themoviedb.org/3/watch/providers/movie?api_key=${environment.movieDb.tmdbKey}&watch_region=${region}`
      )
      .map((results: { results: WatchService[] }) => results.results);

    return this.cache.observable(
      `movie-providers-${region}`,
      request$,
      this.cacheExpiresIn
    );
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

  // TODO: Let user set region

  loadPopularMovies(page: number) {
    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/popular?api_key=${environment.movieDb.tmdbKey}&page=${page}&region=FI`
      )
      .pipe(map((result: { results: TMDbMovie[] }) => result.results));
    return this.cache.observable(`popular-movies-${page}`, movies$, 30 * 60);
  }

  loadBestRatedMovies(page: number) {
    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/top_rated?api_key=${environment.movieDb.tmdbKey}&page=${page}&region=FI`
      )
      .pipe(map((result: { results: TMDbMovie[] }) => result.results));
    return this.cache.observable(`best-rated-movies-${page}`, movies$, 30 * 60);
  }

  loadRecommendedMovies(
    page: number,
    genres?: number[],
    prodYears?: number[],
    keywords?: number[],
    watchProviderIds?: number[]
  ) {
    const genresStr = genres.length ? `&with_genres=${genres.join("|")}` : "";
    const keywordStr = keywords?.length
      ? `&with_keywords=${keywords?.join("|")}`
      : "";

    const yearStr = prodYears.length
      ? `&primary_release_year=${Math.ceil(
          prodYears.reduce((cum, i) => cum + i, 0) / prodYears.length
        )}`
      : "";

    const selectedWatchProviders =
      watchProviderIds !== undefined && watchProviderIds.length !== 0
        ? watchProviderIds
        : this.userService.selectedWatchProviders$.getValue();
    const watchProviders = selectedWatchProviders?.length
      ? `&with_watch_providers=${selectedWatchProviders.join("|")}`
      : "";

    const movies$ = this.http
      .get(
        `https://api.themoviedb.org/3/discover/movie?api_key=${environment.movieDb.tmdbKey}&page=${page}${yearStr}${genresStr}&watch_region=FI${watchProviders}${keywordStr}`
      )
      .pipe(map((result: { results: TMDbMovie[] }) => result.results));
    return this.cache.observable(
      `best-recommended-movies-${page}-${genresStr}-${yearStr}-${watchProviders}-${keywordStr}`,
      movies$,
      30 * 60
    );
  }

  tmdb2movie(movie: TMDbMovie): Movie {
    return {
      posterUrl: movie.poster_path
        ? this.getPosterPath(movie.poster_path)
        : null,
      posterPath: movie.poster_path,
      overview: movie.overview,
      releaseDate: movie.release_date,
      genres: movie.genres ? this.getGenreNames(movie.genres) : [],
      id: movie.id,
      imdbId: movie.imdb_id,
      originalTitle: movie.original_title,
      title: movie.title,
      backdropUrl: null,
      backdropPath: movie.backdrop_path,
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

  movie2MoviePollItemData(movie: Movie): MoviePollItemData {
    return {
      id: movie.id,
      title: movie.title,
      originalTitle: movie.originalTitle,
      tagline: movie.tagline,
      overview: movie.overview,
      director: this.injector
        .get(MovieCreditPipe)
        .transform(movie, "directors", "string"),
      productionCountry: this.injector
        .get(ProductionCoutryPipe)
        .transform(movie, 1),
      runtime: movie.runtime,
      releaseDate: movie.releaseDate,
      posterPath: movie.posterPath,
      backdropPath: movie.backdropPath,
      tmdbRating: movie.tmdbRating,
    };
  }

  movie2MovieIndex(movie: Movie): MovieIndex {
    return {
      title: movie.title,
      tmdbRating: movie.tmdbRating,
      genres: movie.originalObject.genres.map((genre) => genre.id),
      release: movie.releaseDate,
      keywords: movie.originalObject?.keywords?.keywords?.map(
        (keyword) => keyword.id
      ),
    };
  }

  movie2WatchlistItem(movie: Movie): WatchlistItem {
    return {
      moviePollItemData: this.movie2MoviePollItemData(movie),
      movieIndex: this.movie2MovieIndex(movie),
    };
  }
}

export function handleRetryError(delayTime: number, name: string) {
  let retries = 0;
  let exceedAttemptLimit = 3;
  return retryWhen((error) => {
    return error.pipe(
      delay(delayTime),
      concatMap((err) => {
        retries = retries + 1;
        if (retries < exceedAttemptLimit) {
          return of(err);
        } else {
          throw err;
        }
      })
    );
  });
}
