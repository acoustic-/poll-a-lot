import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { BehaviorSubject, combineLatest, map, NEVER, Observable, of, switchMap } from "rxjs";
import { LetterboxdService } from "../letterboxd.service";
import { UserService } from "../user.service";
import { LogEntry } from "../../model/letterboxd";

@Component({
    selector: "latest-reviews",
    templateUrl: "./latest-reviews.component.html",
    styleUrl: "./latest-reviews.component.scss",
    standalone: false
})
export class LatestReviewsComponent implements OnInit, OnDestroy {
  private letterboxdService = inject(LetterboxdService);
  private userService = inject(UserService);

  items$ = new BehaviorSubject<LogEntry[]>([]);
  viewItems$ = new BehaviorSubject<LogEntry[]>([]);
  scrollPosition$: Observable<any>;

  logEntries$: Observable<LogEntry[]>;
  latestViews$: Observable<LogEntry[]>;

  showViewedItemsRowCount = 3;
  showViewedItemsCount = 3 * this.showViewedItemsRowCount;

  PAGE_SIZE = 5;
  subs = NEVER.subscribe();

  ngOnInit() {
    const queryLimiter =
      "where=FeatureLength&where=Film&where=Fiction&where=NoSpoilers&includeFriends=All";

    this.logEntries$ = this.userService.letterboxFollowUsers$.pipe(
      switchMap(users =>
        users.length === 0
          ? of([])
          : combineLatest(
              users.map(user =>
                this.letterboxdService.getLogEntries(user, `where=HasReview&${queryLimiter}`)
              )
            )
      ),
      map(logEntries => logEntries.reduce((cum, log) => [...cum, ...log.items], [])),
      map(logEntries => logEntries.filter(entry => entry.diaryDetails)),
      map((items: LogEntry[]) =>
        items.sort(
          (a, b) =>
            new Date(b.diaryDetails?.diaryDate || 0).valueOf() -
            new Date(a.diaryDetails?.diaryDate || 0).valueOf()
        )
      ),
      map(logEntries =>
        logEntries.map(logEntry => ({
          ...logEntry,
          review: {
            ...logEntry.review,
            text: logEntry.review.lbml.replace(/<[^>]*>/g, ""),
          },
        }))
      )
    );

    this.latestViews$ = this.userService.letterboxFollowUsers$.pipe(
      switchMap(users =>
        users.length === 0
          ? of([])
          : combineLatest(
              users.map(user =>
                this.letterboxdService.getLogEntries(
                  user,
                  `where=HasDiaryDate&where=Rated&perPage=21&${queryLimiter}`
                )
              )
            )
      ),
      map(logEntries => logEntries.reduce((cum, log) => [...cum, ...log.items], [])),
      map((items: LogEntry[]) =>
        items.sort(
          (a, b) =>
            new Date(b.diaryDetails.diaryDate).valueOf() -
            new Date(a.diaryDetails.diaryDate).valueOf()
        )
      )
    );
  }

  showMore() {
    const items = this.items$.getValue();
    const viewItems = this.viewItems$.getValue();

    if (items.length > viewItems.length) {
      this.viewItems$.next([
        ...viewItems,
        ...items.slice(
          viewItems.length - 1,
          viewItems.length - 1 + this.PAGE_SIZE
        ),
      ]);
    }
  }

  onScroll(event) {
    if (
      event.srcElement.scrollLeft >
      event.srcElement.scrollWidth - event.srcElement.clientWidth - 50
    ) {
      this.showMore();
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
