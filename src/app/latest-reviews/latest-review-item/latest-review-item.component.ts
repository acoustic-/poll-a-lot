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
import { v4 as uuid } from "uuid";

@Component({
    selector: "latest-review-item",
    templateUrl: "./latest-review-item.component.html",
    styleUrl: "./latest-review-item.component.scss",
    standalone: false
})
export class LatestReviewItemComponent implements OnInit {
  readonly MAX = 5;

  @Input() set logEntry(logEntry: LogEntry | undefined) {
    this.logEntry$.next(this.addStarObject(logEntry!));
  }
  @Input() set latestView(latestView: LogEntry | undefined) {
    this.latestView$.next(this.addStarObject(latestView!));
  }

  logEntry$ = new BehaviorSubject<LogEntry & { stars: { id: string, type: 'full' | 'half' | 'empty' }[] } | undefined>(undefined);
  latestView$ = new BehaviorSubject<LogEntry & { stars: { id: string, type: 'full' | 'half' | 'empty' }[] } | undefined>(undefined);
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
    const logEntry = this.logEntry$.getValue();
    const ratingHtml = Array.from({ length: 5 }, (_, i) =>
      i < Math.floor(logEntry.rating)
        ? '<span class="material-icons material-symbols-outlined rating-star">star</span>'
        : i < logEntry.rating
        ? '<span class="material-icons material-symbols-outlined rating-star">star_half</span>'
        : '<span class="material-icons material-symbols-outlined empty-star">star_outline</span>'
    ).join('');

    const logDescription = `<div class="flex latest-review-header">
      <img class="latest-review-poster" width="225px" height="225px" src="${logEntry.film.poster.sizes[0].url}"/>
      <div class="flex-column">
        <h2>${logEntry.film.name} (${logEntry.film.releaseYear})</h2>
        <h3>${this.datePipe.transform(logEntry.diaryDetails?.diaryDate, 'dd MMM y')}</h3>
        <div class="rating">${ratingHtml}</div>
        <div class="flex user"><img class="avatar" width="16px" height="16px" src="${logEntry.owner.avatar.sizes[0].url}" style="margin-right: 5px;" />${logEntry.owner.displayName}</div></div></div>
        <p>${logEntry?.review?.lbml}</p>
        <p style="text-align: right;"></p>`;
    const bottomSheet = this.bottomsheet.open(PollDescriptionSheet, {
      data: { html: logDescription, simple: true, generated: false },
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

  private addStarObject(logEntry: LogEntry): LogEntry & { stars: { id: string, type: 'full' | 'half' | 'empty' }[] } {
    const stars = logEntry?.rating ? Array.from({ length: Math.floor(logEntry.rating) }).map(() => ({ id: uuid(), type: 'full' }) as any) : [];
    if (logEntry.rating % 1 !== 0) {
      stars.push({ id: uuid(), type: 'half' } as any);
    }
    Array.from({ length: this.MAX - Math.ceil(logEntry.rating) }).forEach(() => stars.push({ id: uuid(), type: 'empty' } as any));
    return { ...logEntry, stars };
  }
}
