import { ChangeDetectionStrategy, Component } from "@angular/core";

/**
 * The "VS" film-strip divider between the two duel bands.
 *
 * Its own component with a single swappable slot — the artwork is one image
 * (`/assets/img/dual-movie-divider.png`) and replacing it is a one-line
 * change. Rendered full-width; the seam pulls it over both card edges.
 * Decorative only (`aria-hidden`, empty `alt`), never interactive.
 */
@Component({
  selector: "duel-mark",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img src="/assets/img/dual-movie-divider.png" alt="" aria-hidden="true" />`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        line-height: 0;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
      }
    `,
  ],
})
export class DuelMarkComponent {}
