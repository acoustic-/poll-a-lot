import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { Meta } from "@angular/platform-browser";
import { UserService } from "../user.service";
import { Poll } from "../../model/poll";
import { Observable } from "rxjs";

@Component({
  selector: "app-landing",
  templateUrl: "./landing.component.html",
  styleUrls: ["./landing.component.scss"],
})
export class LandingComponent implements OnInit {
  recentPolls$: Observable<{ id: string; name: string }[]>;

  constructor(
    private router: Router,
    private meta: Meta,
    public userService: UserService
  ) {
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
    this.recentPolls$ = this.userService.recentPolls$;
  }

  ngOnInit() {}

  createPoll() {
    this.router.navigate(["/add-poll"]);
  }

  navigateToPoll(poll: { id: Poll["id"] }) {
    this.router.navigate([`/poll/${poll.id}`]);
  }
}
