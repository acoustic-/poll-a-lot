import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { UserService } from "../user.service";
import { Observable } from "rxjs";
import { User } from "../../model/user";
import { NightModeService } from "../night-mode-service.service";
import { MovieSearchDialogComponent } from "../movie-search-dialog/movie-search-dialog.component";
import { defaultDialogOptions } from "../common";

@Component({
    selector: "header",
    templateUrl: "./header.component.html",
    styleUrls: ["./header.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class HeaderComponent {
  private router = inject(Router);
  private userService = inject(UserService);
  private nightModeService = inject(NightModeService);
  private dialog = inject(MatDialog);

  user$: Observable<User>;
  nightMode$: Observable<{ state: boolean }>;

  constructor() {
    this.user$ = this.userService.user$;
    this.nightMode$ = this.nightModeService.night$;
  }
  login() {
    this.userService.openLoginDialog();
  }

  searchMovies() {
    // HeaderComponent sits outside <router-outlet> (app.component.html), so its own
    // ActivatedRoute is the root route, not the poll's — read the poll id straight off
    // the URL against the "poll/:id" path from appRoutes (app.module.ts) instead.
    const currentPollId = this.router.url.match(/^\/poll\/([^/?]+)/)?.[1];
    this.dialog.open(MovieSearchDialogComponent, {
      ...defaultDialogOptions,
      data: { currentPollId },
    });
  }
  logout() {
    this.userService.logout();
  }

  addPoll() {
    this.router.navigate(["/add-poll"]);
  }

  goToRoot() {
    this.router.navigate(["/"]);
  }

  about() {
    this.router.navigate(["/about"]);
  }

  manage() {
    this.router.navigate(["/manage"]);
  }

  watchlist() {
    this.router.navigate(["/watchlist"]);
  }

  settings() {
    this.router.navigate(['/settings']);
  }

  set(state: boolean) {
    this.nightModeService.set(state);
  }
}
