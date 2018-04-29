import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { environment } from '../environments/environment';
import { ImgCacheService } from 'ng-imgcache';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'app';

  constructor(
    private router: Router,
    private imgCacheService: ImgCacheService,
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        gtag('config', environment.analytics, {'page_path': event.urlAfterRedirects});
      }
    });
  }

  ngOnInit() {
    this.imgCacheService.init({

    });
  }
}
