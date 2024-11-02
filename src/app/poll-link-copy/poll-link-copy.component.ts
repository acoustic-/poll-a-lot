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
    ratings: { tmdb?: string, imdb?: string, lb?: string, rt?: string};
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
        `Duration: ${this.description.duration}\n` +
        (this.description?.tagline ? `"${this.description.tagline}"` + "\n" : "") +
        `🌟 Ratings: ${ this.description.ratings.tmdb ? `${this.description.ratings.tmdb}% (TMDb)` : '' }` +
        ` ${ this.description.ratings.lb ? `${this.description.ratings.lb}/5 (Letterboxd)` : '' }` +
        ` ${ this.description.ratings.imdb ? `${this.description.ratings.imdb}/10 (IMDb)` : '' }` +
        ` ${ this.description.ratings.rt ? `${this.description.ratings.rt} (Rotten Tomatoes)` : '' }` +
        '\n\n' +
        (this.description?.overview ? `"${this.description.overview}"` + "\n\n" : "") +
        "➡️ Check more details on Poll-A-Lot:\n" +
        this.tmdbService.getMovielUrl(this.movieId);
      this.copyContentHtml =
        `<b>🎞️ ${this.name}</b><br/><br/>` +
        (this.description?.extraInfo ? this.parseMovieDescriptionHtml(this.description.extraInfo) + "\n" : "") +
        (this.description?.tagline ? `<blockquote><i>"${this.description.tagline}"</i></blockquote>` + "\n" : "") +
        `<b>Duration: </b> ${this.description.duration}<br/>` +
        `🌟 <b>Ratings:</b> ${ this.description.ratings.tmdb ? `<b>${this.description.ratings.tmdb}%</b> (TMDb)` : '' }` +
        ` ${ this.description.ratings.lb ? `<b>${this.description.ratings.lb}</b>/5 (Letterboxd)` : '' }` +
        ` ${ this.description.ratings.imdb ? `<b>${this.description.ratings.imdb}</b>/10 (IMDb)` : '' }` +
        ` ${ this.description.ratings.rt ? `<b>${this.description.ratings.rt}</b> (Rotten Tomatoes)` : '' }` +
        '<br/><br/>' +
        (this.description?.overview ? '<i>"' + this.description.overview + '"</i>' + "<br/><br/>" : "") +
        "<b>➡️ Check more details on Poll-A-Lot: </b><br/>" +
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
