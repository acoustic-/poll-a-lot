import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { Router } from "@angular/router";
import { LogEntry } from "../../../model/letterboxd";
import { UserService } from "../../user.service";
import { MovieDialogService } from "../../movie-dialog.service";
import { LatestReviewItemComponent } from "./latest-review-item.component";

// Minimal LogEntry with every field the collapsed card template dereferences
// (poster/avatar sizes, links, diaryDetails.diaryDate for the `date` pipe).
function makeLogEntry(): LogEntry {
  return {
    id: "log-1",
    name: "log-1",
    owner: {
      displayName: "The Reviewer",
      avatar: { sizes: [{ width: 40, height: 40, url: "https://example.com/a.jpg" }] },
    },
    film: {
      name: "Test Film",
      releaseYear: 2021,
      poster: {
        sizes: [
          { width: 150, height: 225, url: "https://example.com/p-150.jpg" },
          { width: 300, height: 450, url: "https://example.com/p-300.jpg" },
        ],
      },
      links: [{ type: "letterboxd", id: "lb1", url: "https://letterboxd.com/x/" }],
    },
    review: { lbml: "Great.", text: "Great.", containsSpoilers: false },
    diaryDetails: { diaryDate: "2021-05-01", rewatch: false },
    links: [{ type: "letterboxd", id: "lb1", url: "https://letterboxd.com/x/" }],
    rating: 4,
    like: true,
  } as unknown as LogEntry;
}

describe("LatestReviewItemComponent", () => {
  let fixture: ComponentFixture<LatestReviewItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LatestReviewItemComponent],
      providers: [
        { provide: MatBottomSheet, useValue: { open: jasmine.createSpy("open") } },
        { provide: MovieDialogService, useValue: {} },
        { provide: UserService, useValue: { getUser: () => undefined } },
        { provide: Router, useValue: { navigate: jasmine.createSpy("navigate") } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LatestReviewItemComponent);
  });

  it("renders the review card, including the diary date via the `date` pipe", () => {
    fixture.componentInstance.logEntry = makeLogEntry();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(".log-entry-container")).toBeTruthy();
    expect(el.querySelector(".watched .day")?.textContent?.trim()).toBe("01");
    expect(el.querySelector(".watched .month")?.textContent).toContain("May");
    expect(el.textContent).toContain("Test Film");
  });

  it("opens the dedicated dialog on showReview()", () => {
    fixture.componentInstance.logEntry = makeLogEntry();
    fixture.detectChanges();

    const bottomSheet = TestBed.inject(MatBottomSheet);
    fixture.componentInstance.showReview();
    expect(bottomSheet.open).toHaveBeenCalled();
  });
});
