import { ChangeDetectionStrategy, Component } from "@angular/core";
import { Router } from "@angular/router";
import { UserService } from "../user.service";
import { Observable } from "rxjs";
import { User } from "../../model/user";
import { NightModeService } from "../night-mode-service.service";

@Component({
  selector: "header",
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  user$: Observable<User>;
  nightMode$: Observable<{ state: boolean }>;

  constructor(
    private router: Router,
    private userService: UserService,
    private nightModeService: NightModeService
  ) {
    this.user$ = this.userService.user$;
    this.nightMode$ = this.nightModeService.night$;
  }
  login() {
    this.userService.openLoginDialog();
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

  set(state: boolean) {
    this.nightModeService.set(state);
  }
}
