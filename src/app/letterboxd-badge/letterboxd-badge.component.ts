import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

// The Letterboxd brand decal (dots) plus, optionally, the dark
// `.letterboxd-rating` chip treatment it has always shipped with in
// movie-dialog.scss. Any place that shows Letterboxd-sourced data must use
// this so the mark and its attribution styling stay in one place instead of
// being copy-pasted per call site.
@Component({
  selector: "letterboxd-badge",
  templateUrl: "./letterboxd-badge.component.html",
  styleUrls: ["./letterboxd-badge.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LetterboxdBadgeComponent {
  // Text shown after the decal, e.g. "Seen" or "@username on Letterboxd".
  @Input() label?: string;
  // Height of the decal in pixels; width follows the SVG's fixed aspect ratio.
  @Input() size = 14;
  // Applies the dark `.letterboxd-rating` pill background/padding. Off by
  // default so the badge can also sit as plain text on a colored hero or a
  // settings row, where its own background would clash.
  @Input() chip = false;

  // The SVG's <mask> elements need id-referenced <use>/url() links, and this
  // badge now renders many times on one page (once per poll item, search
  // result, etc.) — a shared static id would make every instance's mask
  // resolve to the first one in the DOM.
  private static nextInstanceId = 0;
  readonly maskIdPrefix = `lb-badge-${LetterboxdBadgeComponent.nextInstanceId++}`;

  get width(): number {
    return Math.round((this.size * 20) / 14);
  }
}
