import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { Meta } from "@angular/platform-browser";
import { UserService } from "../user.service";
import { Poll } from "../../model/poll";
import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, first, map, NEVER, Observable, takeUntil, tap } from "rxjs";
import { TMDbService } from "../tmdb.service";
import { TMDbMovie } from "../../model/tmdb";
import { MovieDialogService } from "../movie-dialog.service";
import { isDefined } from "../helpers";

@Component({
    selector: "app-landing",
    templateUrl: "./landing.component.html",
    styleUrls: ["./landing.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LandingComponent implements OnInit, OnDestroy {
  movieId$: Observable<string | null>;

  recentPolls$: Observable<{ id: string; name: string }[]>;
  nowPlaying$: Observable<TMDbMovie[]>;
  popularMovies$: Observable<TMDbMovie[][]>;

  @ViewChild("nowPlayingScroll") nowPlayingScroll: ElementRef | undefined;
  nowPlayingScroll$ = new BehaviorSubject<number | undefined>(undefined)
  
  private subs = NEVER.subscribe();

  constructor (
    private router: Router,
    private route: ActivatedRoute,
    private meta: Meta,
    private tmdbService: TMDbService,
    private movieDialog: MovieDialogService,
    public userService: UserService,
  ) {
    this.movieId$ = this.route.queryParamMap.pipe(
      map((params: ParamMap) => params.get("movieId")),
      filter(isDefined),
      distinctUntilChanged()
    );

    afterNextRender(() => {
      this.meta.addTag({
        name: "description",
        content:
          "Poll creation made easy. Instant. Mobile. Share the way you want!",
      });
      this.meta.addTag({ name: "og:title", content: "Poll-A-Lot" });

      this.meta.addTag({ name: "og:url", content: window.location.href });

      this.meta.addTag({
        name: "og:description",
        content: "Poll creation made easy.",
      });

      this.meta.addTag({
        name: "og:image",
        content:
          location.hostname +
          "/assets/img/poll-a-lot-" +
          Math.floor(Math.random() * 7 + 1) +
          ".png",
      });
      this.meta.addTag({ name: "og:type", content: "webpage" });

      this.subs.add(
        this.movieId$.pipe(map(movieId => Number(movieId))).subscribe((movieId) => {
          setTimeout(() => this.router.navigate(['']));
          const openedMovieDialog = this.movieDialog.openMovie({
            isVoteable: false,
            editable: false,
            movieId,
            addMovie: false,
            landing: true,
            showRecentPollAdder: true,
            useNavigation: true
          });
  
          if (window) {
            // Remove /movie path from url
            openedMovieDialog.afterClosed().subscribe(() => {
              window.history.replaceState({}, '',`/`);
            })
          }
        })
      );
    });
    this.recentPolls$ = this.userService.recentPolls$.asObservable();
    this.nowPlaying$ = this.tmdbService.loadNowPlaying();
    this.popularMovies$ = combineLatest([
      this.tmdbService.loadPopularMovies(2),
      this.tmdbService.loadPopularMovies(1),
      this.tmdbService.loadPopularMovies(3)
    ]);
  }

  ngOnInit() {
  }

  createPoll() {
    this.router.navigate(["/add-poll"]);
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  openMovie(movie: TMDbMovie ) {
    const openedMovieDialog = this.movieDialog.openMovie(
      {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: this.userService.getUser()?.id !== undefined,
        currentMovieOpen: true,
        parentStr: 'a new poll',
        landing: true,
        parent: true,
        useNavigation: true,
        showRecentPollAdder: true,
      }
    );

    openedMovieDialog.componentInstance.addMovie
      .pipe(first(), takeUntil(openedMovieDialog.afterClosed()), filter(isDefined))
      .subscribe((movie) => {
        this.router.navigate(['/add-poll'], { queryParams: { movieId: movie.id } });
        openedMovieDialog.close();
      });
  }

  onScroll(event: { srcElement: { scrollLeft: number | undefined; }; }) {
    this.nowPlayingScroll$.next(event.srcElement.scrollLeft);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}