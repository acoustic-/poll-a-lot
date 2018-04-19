import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit {

  constructor(
    private router: Router,
    private meta: Meta,
  ) {
    this.meta.addTag({name: 'description', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
    this.meta.addTag({name: 'og:title', content: 'Poll-A-Lot'});
    this.meta.addTag({name: 'og:url', content: window.location.href });
    this.meta.addTag({name: 'og:description', content: 'Poll creation made easy.'});
    this.meta.addTag({name: 'og:image', content: '/img/poll-a-lot-' + Math.floor((Math.random() * 7) + 1) + '.png'});
    this.meta.addTag({name: 'og:type', content: 'Poll creation made easy. Instant. Mobile. Share the way you want!'});
  }

  ngOnInit() {
  }

  createPoll() {
    this.router.navigate(['/add-poll']);
  }
}
