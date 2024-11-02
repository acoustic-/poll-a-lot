import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, OnInit } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { PollItemService } from "../poll-item.service";
import { BehaviorSubject, timer } from "rxjs";
import { TMDbService } from "../tmdb.service";
import { Analytics, logEvent } from "@angular/fire/analytics";

@Component({
  selector: "poll-link-copy",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: "./poll-link-copy.component.html",
  styleUrl: "./poll-link-copy.component.scss",
})
export class PollLinkCopyComponent implements OnChanges {
  @Input() pollId?: string;
  @Input() movieId?: string;
  @Input() name: string;
  @Input() description?: {
    extraInfo: string;
    tagline: string;
    rating: string;
    ratingHTML: string;
    duration: string;
    overview: string;
  };
  @Input() color?: string;
  copyContent: string;
  copyContentHtml: string;

  activated$ = new BehaviorSubject<boolean>(false);

  constructor(
    private snackBar: MatSnackBar,
    private router: Router,
    private pollItemService: PollItemService,
    private tmdbService: TMDbService,
    private analytics: Analytics
  ) {
  }

  async copy() {
    const textBlob = new Blob([this.copyContent], { type: "text/plain" });
    const htmlBlob = new Blob([this.copyContentHtml], { type: "text/html" });

    const clipboardItem = new ClipboardItem({
      [textBlob.type]: textBlob,
      [htmlBlob.type]: htmlBlob,
    });

    await navigator.clipboard.write([clipboardItem]);

    this.activated$.next(true);
    timer(5000).subscribe(() => {
      this.activated$.next(false);
    });
    logEvent(this.analytics, 'copy_link', { type: this.movieId ? 'movie' : 'poll', itemId: this.movieId || this.pollId });
    this.snackBar.open("Link copied! 🔗", undefined, { duration: 5000 });
  } 

  ngOnChanges() {
    if (this.pollId) {
      this.copyContent = `🍿 Poll-A-Lot: ${
        this.name
      } ${this.pollItemService.getPollUrl(this.pollId)}${
        this.description ? `\n${this.description}` : ""
      }`;
      this.copyContentHtml = `🍿 Poll-A-Lot: ${
        this.name
      } ${this.pollItemService.getPollUrl(this.pollId)}${
        this.description ? `\n${this.description}` : ""
      }`;
    } else if (this.movieId) {
      this.copyContent =
        `🎞️ ${this.name}\n` +
        (this.description?.extraInfo ? this.description.extraInfo + "\n" : "") +
        (this.description?.tagline ? this.description.tagline + "\n" : "") +
        (this.description?.rating ? this.description.rating + "\n" : "") +
        (this.description?.duration ? this.description.duration + "\n" : "") +
        (this.description?.overview ? this.description.overview + "\n" : "") +
        "Learn more at Poll-A-Lot:\n" +
        this.tmdbService.getMovielUrl(this.movieId);
      this.copyContentHtml =
        `<b>🎞️ ${this.name}</b><br/>` +
        (this.description?.extraInfo ? this.parseMovieDescriptionHtml(this.description.extraInfo) + "\n" : "") +
        (this.description?.tagline ? this.parseMovieDescriptionHtml(this.description.tagline) + "\n" : "") +
        (this.description?.ratingHTML ? this.parseMovieDescriptionHtml(this.description.ratingHTML) + "\n" : "") +
        (this.description?.duration ? this.parseMovieDescriptionHtml(this.description.duration) + "\n" : "") +
        (this.description?.overview ? this.parseMovieDescriptionHtml(this.description.overview) + "\n" : "") +
        "<b>➡️ Learn more with Poll-A-Lot: </b><br/>" +
        this.tmdbService.getMovielUrl(this.movieId);
    }
  }

  private parseMovieDescriptionHtml(str: string): string {
    let result = "";
    if (str[0] === '"') {
      result += `<i>${str}</i><br/>`;
    } else if (str.indexOf(":") > 0) {
      const i = str.indexOf(":");
      result += `<b>${str.slice(0, i)}: </b>${str.slice(i + 1)}<br/>`;
    } else if (str.indexOf("|") > 0) {
      const i = str.indexOf("|");
      result += `<b>${str.slice(0, i)}</b> | ${str.slice(i + 1)}<br/>`;
    } else {
      result += str;
    }
    return result;
  }
}
