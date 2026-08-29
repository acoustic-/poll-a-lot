import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { LogEntryWithStars } from "../../../model/letterboxd";
import {
  LatestReviewDialogComponent,
  LatestReviewDialogData,
} from "./latest-review-dialog.component";

function makeLogEntry(overrides: Partial<LogEntryWithStars> = {}): LogEntryWithStars {
  return {
    id: "log-1",
    name: "log-1",
    owner: {
      id: "m1",
      username: "reviewer",
      givenName: "",
      displayName: "The Reviewer",
      shortName: "",
      pronoun: {} as never,
      avatar: { sizes: [{ width: 40, height: 40, url: "https://example.com/a.jpg" }] },
      memberStatus: "member",
      hideAdsInContent: false,
      accountStatus: "active",
      hideAds: false,
    },
    film: {
      id: "f1",
      name: "Test Film",
      sortingName: "Test Film",
      releaseYear: 2021,
      runTime: 128,
      rating: 4.13,
      directors: [
        { id: "d1", name: "First Director", tmdbid: "1" },
        { id: "d2", name: "Second Director", tmdbid: "2" },
      ],
      poster: {
        sizes: [
          { width: 150, height: 225, url: "https://example.com/p-150.jpg" },
          { width: 400, height: 600, url: "https://example.com/p-400.jpg" },
        ],
      },
      adult: false,
      reviewsHidden: false,
      posterCustomisable: false,
      backdropCustomisable: false,
      filmCollectionId: "",
      links: [],
      relationships: [],
      genres: [
        { id: "g1", name: "Drama" },
        { id: "g2", name: "Thriller" },
      ],
    },
    review: {
      lbml: "A <strong>great</strong> watch.",
      containsSpoilers: false,
      spoilersLocked: false,
      moderated: false,
      whenReviewed: "2021-05-01",
      text: "A great watch.",
    },
    diaryDetails: { diaryDate: "2021-05-01", rewatch: true },
    tags2: [
      { tag: "favourite", code: "favourite", displayTag: "favourite" },
      { tag: "2021", code: "2021", displayTag: "2021" },
    ],
    whenCreated: "2021-05-01",
    whenUpdated: "2021-05-01",
    rating: 4,
    like: true,
    commentable: true,
    links: [
      { type: "letterboxd", id: "lb1", url: "https://letterboxd.com/reviewer/film/test-film/" },
    ],
    stars: [
      { id: "s1", type: "full" },
      { id: "s2", type: "full" },
      { id: "s3", type: "full" },
      { id: "s4", type: "full" },
      { id: "s5", type: "empty" },
    ],
    ...overrides,
  };
}

async function render(data: LatestReviewDialogData): Promise<ComponentFixture<LatestReviewDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [LatestReviewDialogComponent],
    providers: [
      { provide: MAT_BOTTOM_SHEET_DATA, useValue: data },
      { provide: MatBottomSheetRef, useValue: { dismiss: jasmine.createSpy("dismiss") } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LatestReviewDialogComponent);
  fixture.detectChanges();
  return fixture;
}

describe("LatestReviewDialogComponent", () => {
  it("surfaces director, runtime, genres and the Letterboxd rating", async () => {
    const fixture = await render({ logEntry: makeLogEntry() });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

    expect(text).toContain("First Director, Second Director");
    expect(text).toContain("2h 8m");
    expect(text).toContain("Drama, Thriller");
    expect(text).toContain("4.1");
  });

  it("renders the reviewer's Letterboxd tags", async () => {
    const fixture = await render({ logEntry: makeLogEntry() });
    const tags = (fixture.nativeElement as HTMLElement).querySelectorAll(".lr-tag");
    expect([...tags].map((t) => t.textContent?.trim())).toEqual(["favourite", "2021"]);
  });

  it("shows like and rewatch badges when set", async () => {
    const fixture = await render({ logEntry: makeLogEntry() });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(".lr-like")).toBeTruthy();
    expect(el.querySelector(".lr-rewatch")).toBeTruthy();
  });

  it("links to the Letterboxd log entry", async () => {
    const fixture = await render({ logEntry: makeLogEntry() });
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="latest-review-letterboxd-link"]'
    );
    expect(link?.getAttribute("href")).toBe("https://letterboxd.com/reviewer/film/test-film/");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("blurs a spoiler review until revealed", async () => {
    const fixture = await render({
      logEntry: makeLogEntry({
        review: {
          lbml: "The killer was the butler.",
          containsSpoilers: true,
          spoilersLocked: false,
          moderated: false,
          whenReviewed: "2021-05-01",
          text: "The killer was the butler.",
        },
      }),
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector(".lr-review-blurred")).toBeTruthy();

    el.querySelector<HTMLButtonElement>('[data-testid="latest-review-reveal-spoilers"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector(".lr-review-blurred")).toBeNull();
  });
});
