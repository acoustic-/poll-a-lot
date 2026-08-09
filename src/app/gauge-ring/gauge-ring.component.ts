import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

// A circular progress ring — the visual mechanic behind the Daily Reel Pace
// gauge (settings.component.html), extracted so the poll seen-progress ring
// (poll.component.html) can reuse the exact same arc math and wipe-in
// animation instead of re-deriving it. The radius/viewBox are fixed
// constants rather than inputs: they're the numbers the wipe animation's
// `stroke-dashoffset` keyframe (see gauge-ring.component.scss) is derived
// from, and there's no consumer that needs a different ring geometry, only
// a different physical size, stroke thickness, fill color or label.
//
// Track and fill colors are deliberately not @Inputs — consumers set the
// `--gauge-track-color` / `--gauge-fill-color` CSS custom properties on the
// host instead (a plain color, or `url(#svgGradientId)` for a gradient
// stroke), which lets each caller style the ring with its own stylesheet
// the same way it would style any other element, and inherit a value from
// an ancestor (as the Reel Pace card's per-state `--pace-color` already
// does) without this component knowing about either caller's palette.
@Component({
  selector: 'gauge-ring',
  templateUrl: './gauge-ring.component.html',
  styleUrls: ['./gauge-ring.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class GaugeRingComponent {
  private static readonly RADIUS = 17;
  private static readonly CIRCUMFERENCE = 2 * Math.PI * GaugeRingComponent.RADIUS;

  readonly radius = GaugeRingComponent.RADIUS;

  // Physical rendered size in px; the internal viewBox stays fixed at
  // 0 0 44 44 regardless, so this just scales the whole ring uniformly.
  @Input() size = 44;

  // Stroke width in viewBox units (not px) — thinner rings (e.g. the poll
  // header's 3px) still use the same 44-unit viewBox and r=17 circle.
  @Input() strokeWidth = 6;

  // Fraction complete, clamped to [0, 1] — a ring can't visually show more
  // than a full circle as a single arc. NaN/undefined fall back to 0 rather
  // than propagating into the dasharray, since this is now a shared
  // primitive rather than one call site that always passes a real number.
  @Input() set progress(value: number) {
    this._progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  get progress(): number {
    return this._progress;
  }
  private _progress = 0;

  get dashArray(): string {
    const arc = GaugeRingComponent.CIRCUMFERENCE * this._progress;
    return `${arc} ${GaugeRingComponent.CIRCUMFERENCE}`;
  }

  // A 0-length dash with a round linecap still paints a full-diameter dot
  // (the two caps meet with nothing between them) that visibly orbits the
  // ring as the wipe-in animation slides stroke-dashoffset — round is only
  // correct once there's an actual arc to cap.
  get strokeLinecap(): 'round' | 'butt' {
    return this._progress > 0 ? 'round' : 'butt';
  }
}
