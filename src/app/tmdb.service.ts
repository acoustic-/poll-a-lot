import { afterNextRender, Inject, Injectable, Injector, DOCUMENT } from "@angular/core";
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
  ExtraRating,
} from "../model/tmdb";
import { Observable, merge, of } from "rxjs";
import { LocalCacheService } from "./local-cache.service";
import { TMDbSeries, TMDbSeriesResponse } from "../model/tmdb";
import {
  catchError,
  concatMap,
  delay,
  distinctUntilChanged,
  first,
  last,
  map,
  retryWhen,
  scan,
  shareReplay,
  switchMap,
} from "rxjs/operators";
import { UserService } from "./user.service";
import { ProductionCoutryPipe } from "./production-country.pipe";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { LetterboxdService } from "./letterboxd.service";
import { isEqual } from "./helpers";

import { LetterboxdItem } from "../model/letterboxd";

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
    private injector: Injector,
    @Inject(DOCUMENT) private document: Document
  ) {
    afterNextRender(() => {
      this.loadConfig();
      this.loadGenres();
    });
  }

  loadTMDBMovie(tmdbId: number): Observable<Readonly<TMDbMovie>> {
    const obs$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${environment.movieDb.tmdbKey}`
      )
      .pipe(map((movie: TMDbMovie) => movie));

    return this.cache.observable(
      `tmdb-movie-${tmdbId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  loadMovie(tmdbId: number): Observable<Readonly<Movie>> {
    const obs$ = this.http
      .get(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${environment.movieDb.tmdbKey}&append_to_response=images,recommendations,keywords,credits,alternative_titles&language=en-US&include_image_language=en`
      )
      .pipe(map((movie: TMDbMovie) => this.tmdb2movie(movie)));

    return this.cache.observable(
      `movie-id-${tmdbId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  loadCombinedMovie(
    tmdbId: number,
    singleEmit = true
  ): Observable<Readonly<Movie>> {
    const movie$ = this.loadMovie(tmdbId).pipe(shareReplay(1));
    const combinedMovie$: Observable<Movie> = movie$
      .pipe(
        switchMap((movie) =>
          merge(
            of(movie),
            of(movie).pipe(
              first(),
              switchMap((movie) =>
                this.combineWithWatchProviders(movie.id).pipe(
                  map((result) => ({ ...movie, ...result })),
                  catchError(() => of(movie))
                )
              )
            ),
            of(movie).pipe(
              first(),
              switchMap((movie) =>
                this.combineWithOMDbData(movie).pipe(
                  map((result) => ({ ...movie, ...result })),
                  catchError(() => of(movie))
                )
              )
            ),
            of(movie).pipe(
              first(),
              switchMap((movie) =>
                this.combineWithLetterboxdData(movie.id).pipe(
                  map((result) => ({ ...movie, ...result })),
                  catchError(() => of(movie))
                )
              )
            )
          )
        )
      )
      .pipe(
        scan((cumulative, current) => ({ ...cumulative, ...current })),
        distinctUntilChanged(isEqual)
      );

    return singleEmit ? combinedMovie$.pipe(last()) : combinedMovie$;
  }

  loadSeries(tmdbId: number): Observable<Readonly<TMDbSeries>> {
    const tmdbSeries$ = this.http
      .get(
        `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${environment.movieDb.tmdbKey}`
      )
      .pipe(map((series: TMDbSeries) => series));
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
      .pipe(map((watchProviders: WatchProviders) => watchProviders));
    return this.cache.observable(
      `watch-providers-${tmdbId}`,
      watchProviders$,
      this.cacheExpiresIn
    );
  }

  searchMovies(
    searchString: string,
    page = 1,
    year?: number | string
  ): Observable<TMDbMovie[]> {
    const query = searchString.replace(/\s+/g, "+").trim();
    return this.http
      .get(
        `https://api.themoviedb.org/3/search/movie?api_key=${
          environment.movieDb.tmdbKey
        }&query=${query}${year ? "&year=" + year : ""}&page=${page}`
      )
      .pipe(
        map((response: TMDbMovieResponse) => {
          return response.results;
        })
      );
  }

  searchSeries(searchString: string): Observable<TMDbSeries[]> {
    const query = searchString.replace(/\s+/g, "+").trim();
    return this.http
      .get(
        `https://api.themoviedb.org/3/search/tv?api_key=${environment.movieDb.tmdbKey}&query=${query}`
      )
      .pipe(
        map((response: TMDbSeriesResponse) => {
          return response.results;
        })
      );
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

  combineWithOMDbData(
    movie: Movie
  ): Observable<Partial<ExtraRating> & { omdbMovie: any }> {
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
          imdbRating: imdb,
          metaRating: meta,
          rottenRating: rotten,
          omdbMovie,
        };
      })
    );

    return this.cache.observable(
      `movie-omdb-id-${movie.imdbId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  combineWithLetterboxdData(
    movieId: number
  ): Observable<{ letterboxdRating: number; letterboxdItem: LetterboxdItem }> {
    const obs$ = this.letterboxdService.getFilm(movieId).pipe(
      map((lbMovie: any) => ({
        letterboxdRating: lbMovie?.rating,
        letterboxdItem: lbMovie,
      }))
    );

    return this.cache.observable(
      `movie-letterboxd-id-${movieId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  combineWithWatchProviders(
    movieId: number
  ): Observable<{ watchProviders: WatchProviders }> {
    const obs$ = this.loadWatchProviders(movieId).pipe(
      map((watchProviders: WatchProviders) => ({
        watchProviders,
      }))
    );

    return this.cache.observable(
      `movie-with-providers-${movieId}`,
      obs$,
      this.cacheExpiresIn
    );
  }

  loadMovieProviders(region: string): Observable<WatchService[]> {
    const request$ = this.http
      .get(
        `https://api.themoviedb.org/3/watch/providers/movie?api_key=${environment.movieDb.tmdbKey}&watch_region=${region}`
      )
      .pipe(map((results: { results: WatchService[] }) => results.results));

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

  loadNowPlaying(): Observable<TMDbMovie[]> {
    const x =
      "https://api.themoviedb.org/3/movie/now_playing?language=en-FI&page=1&region=FI";

    const movies$ = this.userService.userData$.pipe(
      map((data) => data?.region || "FI"),
      switchMap((region) =>
        this.http
          .get(
            `https://api.themoviedb.org/3/movie/now_playing?api_key=${environment.movieDb.tmdbKey}&language=en-${region}&page=1&region=${region}`
          )
          .pipe(map((result: { results: TMDbMovie[] }) => result.results))
      )
    );

    return this.cache.observable(`now-loading-movies`, movies$, 30 * 60);
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
      backdropPath: movie.images.backdrops[0]?.file_path || movie.backdrop_path,
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
      backdropPath:
        movie.originalObject.images.backdrops[0]?.file_path ||
        movie.backdropPath,
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

  getMovielUrl(movieId: string | number): string {
    const u = this.document.location.href.split("/");
    return `${u[0]}//${u[2]}/movie/${movieId}`;
  }

  private loadGenres(): void {
    const request$ = this.http.get(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=${environment.movieDb.tmdbKey}`
    );

    this.cache
      .observable("movie-generes", request$, this.cacheExpiresIn)
      .subscribe((response: { genres: { id: number; name: string }[] }) => {
        this.genres = response.genres;
      });
  }

  private loadConfig(): void {
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
