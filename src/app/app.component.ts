import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'app';

  constructor(
    private router: Router,
  ) {
    this.router.events.subscribe((event) => {
      // if (event instanceof NavigationEnd) {
      //   gtag('config', environment.analytics, {'page_path': event.urlAfterRedirects});
      // }
      window.scrollTo(0, 1);
    });
  }
}
