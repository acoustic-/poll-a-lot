import { ViewportScroller } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { NavigationEnd, NavigationStart, Router } from "@angular/router";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = "app";
  private scrollPositions: { [url: string]: [number, number] } = {};

  constructor(
    private router: Router,
    private viewportScroller: ViewportScroller
  ) {
    afterNextRender(() => {
      this.router.events.subscribe((event) => {
        // if (event instanceof NavigationEnd) {
        //   gtag('config', environment.analytics, {'page_path': event.urlAfterRedirects});
        // }
      });

      // This should retain scroll position with query parameter same page navigation
      this.router.events.subscribe((event: any) => {
        if (event instanceof NavigationStart) {
          this.scrollPositions[this.router.url.split("?")[0]] =
            viewportScroller.getScrollPosition(); // Save scroll position
        }

        if (event instanceof NavigationEnd) {
          const storedScrollPosition =
            this.scrollPositions[event.urlAfterRedirects];
          if (storedScrollPosition !== undefined) {
            setTimeout(
              () =>
                this.viewportScroller.scrollToPosition(storedScrollPosition),
              10
            ); // Restore scroll position
          }
        }
      });
    });
  }
}
