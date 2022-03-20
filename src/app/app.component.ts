import { ChangeDetectionStrategy, Component } from "@angular/core";
import { Router } from "@angular/router";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = "app";

  constructor(private router: Router) {
    this.router.events.subscribe((event) => {
      // if (event instanceof NavigationEnd) {
      //   gtag('config', environment.analytics, {'page_path': event.urlAfterRedirects});
      // }
      window.scrollTo(0, 1);
    });
  }
}
