import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { Meta } from "@angular/platform-browser";
import { UserService } from "../user.service";
import { Poll } from "../../model/poll";
import { distinctUntilChanged, filter, map, NEVER, Observable } from "rxjs";
import { MovieDialog } from "../movie-poll-item/movie-dialog/movie-dialog";
import { MatDialog } from "@angular/material/dialog";
import { defaultDialogHeight, defaultDialogOptions } from "../common";

@Component({
  selector: "app-landing",
  templateUrl: "./landing.component.html",
  styleUrls: ["./landing.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit, OnDestroy {
  movieId$: Observable<string | undefined>;

  recentPolls$: Observable<{ id: string; name: string }[]>;

  private subs = NEVER.subscribe();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private meta: Meta,
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
    });
    this.recentPolls$ = this.userService.recentPolls$.asObservable();
  }

  ngOnInit() {
    this.movieId$ = this.route.paramMap.pipe(
      map((params: ParamMap) => params.get("id")),
      filter(id => !!id),
      distinctUntilChanged()
    );

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
  }

  createPoll() {
    this.router.navigate(["/add-poll"]);
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
