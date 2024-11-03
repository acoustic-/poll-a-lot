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
import { distinctUntilChanged, filter, first, fromEvent, map, NEVER, Observable, takeUntil, tap } from "rxjs";
import { MovieDialog } from "../movie-poll-item/movie-dialog/movie-dialog";
import { MatDialog } from "@angular/material/dialog";
import { defaultDialogHeight, defaultDialogOptions } from "../common";
import { TMDbService } from "../tmdb.service";
import { TMDbMovie } from "../../model/tmdb";
import { fadeInOut } from "../shared/animations";

@Component({
  selector: "app-landing",
  templateUrl: "./landing.component.html",
  styleUrls: ["./landing.component.scss"],
  animations: [fadeInOut],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit, OnDestroy {
  movieId$: Observable<string | undefined>;

  recentPolls$: Observable<{ id: string; name: string }[]>;
  nowPlaying$: Observable<TMDbMovie[]>;

  @ViewChild("nowPlayingScroll") nowPlayingScroll: ElementRef;
  nowPlayingScroll$: Observable<any>;

  private subs = NEVER.subscribe();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private meta: Meta,
    private tmdbService: TMDbService,
    public userService: UserService,
    public dialog: MatDialog
  ) {
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
        this.movieId$.subscribe((movieId) => {
          const openedMovieDialog = this.dialog.open(MovieDialog, {
            ...defaultDialogOptions,
            height: defaultDialogHeight,
            data: {
              isVoteable: false,
              editable: false,
              movieId,
              addMovie: false,
              landing: true,
              showRecentPollAdder: true
            },
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
    this.nowPlaying$ = this.tmdbService.loadNowPlaying().pipe(tap(() => {
      this.nowPlayingScroll$ = fromEvent(this.nowPlayingScroll.nativeElement,'scroll')
        .pipe(map((e: Event) => e.target['scrollLeft']));  
    }));
  }

  ngOnInit() {
    this.movieId$ = this.route.paramMap.pipe(
      map((params: ParamMap) => params.get("id")),
      filter(id => !!id),
      distinctUntilChanged()
    );
  }

  createPoll() {
    this.router.navigate(["/add-poll"]);
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  openMovie(movie: TMDbMovie ) {
    const openedMovieDialog = this.dialog.open(MovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: this.userService.getUser()?.id !== undefined,
        currentMovieOpen: true,
        parentStr: 'a new poll',
        landing: true,
        parent: true,
      },
    });
    openedMovieDialog.componentInstance.addMovie
      .pipe(first(), takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.router.navigate(['/add-poll'], { queryParams: { movieId: movie.id } });
        openedMovieDialog.close();
      });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
