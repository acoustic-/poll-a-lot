import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet";
import { MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { ImageSize, LogEntryWithStars } from "../../../model/letterboxd";

export interface LatestReviewDialogData {
  logEntry: LogEntryWithStars;
}

@Component({
  selector: "latest-review-dialog",
  templateUrl: "./latest-review-dialog.component.html",
  styleUrls: ["./latest-review-dialog.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatButton, MatIcon, MatTooltip, LazyLoadImageModule],
})
export class LatestReviewDialogComponent {
  private bottomSheetRef =
    inject<MatBottomSheetRef<LatestReviewDialogComponent>>(MatBottomSheetRef);

  // The log entry is injected once and never mutates, so everything derived from
  // it is computed once here rather than in template getters.
  readonly logEntry = inject<LatestReviewDialogData>(MAT_BOTTOM_SHEET_DATA).logEntry;
  readonly film = this.logEntry.film;
  readonly owner = this.logEntry.owner;
  readonly posterUrl = this.pickImage(this.film?.poster?.sizes, 300);
  readonly avatarUrl = this.owner?.avatar?.sizes?.[0]?.url;
  readonly reviewHtml = this.logEntry.review?.lbml;
  readonly diaryDate = this.logEntry.diaryDetails?.diaryDate;
  readonly rewatch = !!this.logEntry.diaryDetails?.rewatch;
  readonly rating = this.film?.rating;
  // Director(s) · runtime · genres — the movie-dialog-style single subtitle line.
  readonly subtitleParts = [
    (this.film?.directors ?? []).map((director) => director.name).filter(Boolean).join(", "),
    this.formatRuntime(this.film?.runTime),
    (this.film?.genres ?? []).map((genre) => genre.name).filter(Boolean).join(", "),
  ].filter((part): part is string => !!part);
  // Only a link the API actually tagged as Letterboxd — no "first link" fallback,
  // since the template labels it "View on Letterboxd" unconditionally.
  readonly letterboxdUrl = (this.logEntry.links ?? []).find(
    (link) => link.type === "letterboxd"
  )?.url;

  // Only relevant when the review is flagged as containing spoilers — the body
  // stays blurred until the reader opts in.
  readonly revealSpoilers = signal(false);
  readonly spoilerHidden = computed(
    () => !!this.logEntry.review?.containsSpoilers && !this.revealSpoilers()
  );

  close(): void {
    this.bottomSheetRef.dismiss();
  }

  private formatRuntime(minutes: number | undefined): string | undefined {
    if (!minutes || minutes <= 0) {
      return undefined;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h ${rest}m` : `${rest}m`;
  }

  // Letterboxd returns a handful of poster/avatar sizes ascending by width — pick
  // the smallest that's at least `minWidth`, else the largest available.
  private pickImage(sizes: ImageSize[] | undefined, minWidth: number): string | undefined {
    if (!sizes?.length) {
      return undefined;
    }
    const sorted = [...sizes].sort((a, b) => a.width - b.width);
    return (sorted.find((size) => size.width >= minWidth) ?? sorted[sorted.length - 1]).url;
  }
}
