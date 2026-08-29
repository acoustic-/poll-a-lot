import { Component, Input, inject } from "@angular/core";
import { BehaviorSubject, first, takeUntil } from "rxjs";
import { TMDbMovie } from "../../../model/tmdb";
import { LogEntry, LogEntryWithStars, Star } from "../../../model/letterboxd";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { LatestReviewDialogComponent } from "../latest-review-dialog/latest-review-dialog.component";
import { UserService } from "../../user.service";
import { Router } from "@angular/router";
import { DatePipe, NgTemplateOutlet, AsyncPipe } from "@angular/common";
import { MovieDialogService } from "../../movie-dialog.service";
import { v4 as uuid } from "uuid";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { HyphenatePipe } from "../../hyphen.pipe";

@Component({
    selector: "latest-review-item",
    templateUrl: "./latest-review-item.component.html",
    styleUrl: "./latest-review-item.component.scss",
    imports: [LazyLoadImageModule, MatIcon, MatTooltip, NgTemplateOutlet, AsyncPipe, DatePipe, HyphenatePipe]
})
export class LatestReviewItemComponent {
  private bottomsheet = inject(MatBottomSheet);
  private movieDialog = inject(MovieDialogService);
  private userService = inject(UserService);
  private router = inject(Router);

  readonly MAX = 5;

  @Input() set logEntry(logEntry: LogEntry | undefined) {
    this.logEntry$.next(this.addStarObject(logEntry!));
  }
  @Input() set latestView(latestView: LogEntry | undefined) {
    this.latestView$.next(this.addStarObject(latestView!));
  }

  logEntry$ = new BehaviorSubject<LogEntryWithStars | undefined>(undefined);
  latestView$ = new BehaviorSubject<LogEntryWithStars | undefined>(undefined);
  today = new Date();
  year = String(this.today.getFullYear());

  movie$ = new BehaviorSubject<TMDbMovie | undefined>(undefined);

  // for template use
  Math = Math; 
  Array = Array;

  showReview() {
    this.bottomsheet.open(LatestReviewDialogComponent, {
      data: { logEntry: this.logEntry$.getValue() },
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

  private addStarObject(logEntry: LogEntry): LogEntryWithStars {
    const stars: Star[] = logEntry?.rating ? Array.from({ length: Math.floor(logEntry.rating) }).map(() => ({ id: uuid(), type: 'full' })) : [];
    if (logEntry.rating % 1 !== 0) {
      stars.push({ id: uuid(), type: 'half' });
    }
    Array.from({ length: this.MAX - Math.ceil(logEntry.rating) }).forEach(() => stars.push({ id: uuid(), type: 'empty' }));
    return { ...logEntry, stars };
  }
}
