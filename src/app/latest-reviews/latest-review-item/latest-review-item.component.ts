import { Component, Input, OnInit } from "@angular/core";
import { BehaviorSubject, first, takeUntil } from "rxjs";
import { TMDbMovie } from "../../../model/tmdb";
import { LogEntry } from "../../../model/letterboxd";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { PollDescriptionSheet } from "../../poll/poll-description-dialog/poll-description-dialog";
import { UserService } from "../../user.service";
import { Router } from "@angular/router";
import { DatePipe } from "@angular/common";
import { MovieDialogService } from "../../movie-dialog.service";

@Component({
  selector: "latest-review-item",
  templateUrl: "./latest-review-item.component.html",
  styleUrl: "./latest-review-item.component.scss",
})
export class LatestReviewItemComponent implements OnInit {
  @Input() logEntry?: LogEntry;
  @Input() latestView?: LogEntry
  today = new Date();
  year = String(this.today.getFullYear());

  movie$ = new BehaviorSubject<TMDbMovie | undefined>(undefined);

  // for template use
  Math = Math; 
  Array = Array;

  constructor(
    private bottomsheet: MatBottomSheet,
    private movieDialog: MovieDialogService,
    private userService: UserService,
    private router: Router,
    private datePipe: DatePipe,
  ) {}

  ngOnInit() {}

  showReview() {
    const ratingHtml = Array.from({ length: 5 }, (_, i) =>
      i < Math.floor(this.logEntry.rating)
        ? '<span class="material-icons material-symbols-outlined rating-star">star</span>'
        : i < this.logEntry.rating
        ? '<span class="material-icons material-symbols-outlined rating-star">star_half</span>'
        : '<span class="material-icons material-symbols-outlined empty-star">star_outline</span>'
    ).join('');

    const logDescription = `<div class="flex latest-review-header">
      <img class="latest-review-poster" width="100px" height="155px" src="${this.logEntry.film.poster.sizes[0].url}" />
      <div class="flex-column">
        <h2>${this.logEntry.film.name} (${this.logEntry.film.releaseYear})</h2>
        <h3>${this.datePipe.transform(this.logEntry.diaryDetails?.diaryDate, 'dd MMM yyyy')}</h3>
        ${ratingHtml}
        <div class="flex user"><img class="avatar" width="16px" height="16px" src="${this.logEntry.owner.avatar.sizes[0].url}" style="margin-right: 3px;" />${this.logEntry.owner.displayName}</div></div></div>
        <p>${this.logEntry?.review?.lbml}</p>
        <p style="text-align: right;"></p>`;
    const bottomSheet = this.bottomsheet.open(PollDescriptionSheet, {
      data: { description: logDescription, simple: true, generated: false },
      panelClass: "bottomsheet-dark-theme",
    });
  }

  openMovie(logEntry: LogEntry) {
    const tmdbId = logEntry.film?.links?.find(link => link.type === 'tmdb')?.id;
    const openedMovieDialog = this.movieDialog.openMovie({
        isVoteable: false,
        editable: false,
        movieId: Number(tmdbId),
        addMovie: this.userService.getUser()?.id !== undefined,
        currentMovieOpen: true,
        parentStr: 'a new poll',
        landing: true,
        parent: true,
        useNavigation: true,
    });
    
    openedMovieDialog.componentInstance.addMovie
      .pipe(first(), takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.router.navigate(['/add-poll'], { queryParams: { movieId: movie.id } });
        openedMovieDialog.close();
      });
  }
}
