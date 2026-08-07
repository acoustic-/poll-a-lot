import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { UserService } from "./user.service";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class AppComponent {
  title = "app";

  constructor(
    private readonly userService: UserService,
  ) {
    // afterNextRender (not ngOnInit) so this only ever runs in the browser,
    // same reasoning as UserService's own localStorage assignment — opening
    // a MatDialog during SSR isn't meaningful.
    afterNextRender(() => {
      this.userService.openWelcomeDialogIfFirstVisit();
    });
  }
}
