import { afterNextRender, ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { UserService } from "./user.service";
import { HeaderComponent } from "./header/header.component";
import { RouterOutlet } from "@angular/router";
import { FooterComponent } from "./footer/footer.component";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [HeaderComponent, RouterOutlet, FooterComponent]
})
export class AppComponent {
  private readonly userService = inject(UserService);

  title = "app";

  constructor() {
    // afterNextRender (not ngOnInit) so this only ever runs in the browser,
    // same reasoning as UserService's own localStorage assignment — opening
    // a MatDialog during SSR isn't meaningful.
    afterNextRender(() => {
      this.userService.openWelcomeDialogIfFirstVisit();
    });
  }
}
