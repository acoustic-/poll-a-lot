import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    inject,
} from "@angular/core";
import { MatTooltipModule } from "@angular/material/tooltip";
import { UserAvatarComponent, AvatarSize } from "../user-avatar/user-avatar.component";
import { ResolvedIdentity } from "../user-identity.service";

// Circle box size (content + the 1px border on each side, from
// user-avatar.component.scss's .size-* rules) and the negative overlap
// margin each subsequent circle uses (avatar-stack.component.scss's
// .stack-item/.overflow-chip .size-* rules). Kept here, not read from CSS,
// so the reserved width below is a plain synchronous computation — but the
// two files must stay in sync; a size added to one needs the other updated.
const BOX_SIZE: Record<AvatarSize, number> = { xxs: 16, xs: 22, s: 30, m: 38, l: 98 };
const OVERLAP: Record<AvatarSize, number> = { xxs: 5, xs: 8, s: 8, m: 8, l: 8 };

// Largest to smallest, matching the visual scale of AVATAR_PIXEL_SIZES.
const SIZE_ORDER: readonly AvatarSize[] = ["l", "m", "s", "xs", "xxs"];

export interface AvatarStackCandidate {
  size: AvatarSize;
  max: number;
}

export interface AvatarStackFit extends AvatarStackCandidate {
  widthPx: number;
}

// How many boxes the stack actually renders for a given identity count and
// cap: every identity up to `max`, or `max - 1` plus an overflow chip once
// there are more identities than that.
function stackItemCount(count: number, max: number): number {
  return Math.min(count, Math.max(max, 0));
}

export function reservedWidthPxFor(size: AvatarSize, count: number, max: number): number {
  const box = BOX_SIZE[size];
  const overlap = OVERLAP[size];
  const items = stackItemCount(count, max);
  return items > 0 ? box + (items - 1) * (box - overlap) : 0;
}

// The degrade path used when a caller doesn't supply its own candidate list:
// hold the requested size and shrink `max` down to 1, then drop to the next
// smaller size and repeat, down to a single xxs avatar.
export function defaultAvatarStackCandidates(size: AvatarSize, max: number): AvatarStackCandidate[] {
  const startIndex = Math.max(SIZE_ORDER.indexOf(size), 0);
  const candidates: AvatarStackCandidate[] = [];
  for (const candidateSize of SIZE_ORDER.slice(startIndex)) {
    for (let candidateMax = max; candidateMax >= 1; candidateMax--) {
      candidates.push({ size: candidateSize, max: candidateMax });
    }
  }
  return candidates;
}

// Walks `candidates` largest to smallest, returning the first whose reserved
// width fits inside `availableWidthPx`. Falls back to the last (smallest)
// candidate if none fit, so callers always get *something* rather than
// nothing to render. Pure so it's unit-testable without a DOM/ResizeObserver.
export function fitStack(
  count: number,
  availableWidthPx: number,
  candidates: readonly AvatarStackCandidate[],
): AvatarStackFit {
  for (const candidate of candidates) {
    const widthPx = reservedWidthPxFor(candidate.size, count, candidate.max);
    if (widthPx <= availableWidthPx) {
      return { ...candidate, widthPx };
    }
  }
  const fallback = candidates[candidates.length - 1];
  return { ...fallback, widthPx: reservedWidthPxFor(fallback.size, count, fallback.max) };
}

@Component({
    selector: "avatar-stack",
    templateUrl: "./avatar-stack.component.html",
    styleUrls: ["./avatar-stack.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [UserAvatarComponent, MatTooltipModule],
    // autoFit measures *this* element via ResizeObserver, so it's this
    // element — not the inner .avatar-stack div — that needs to be able to
    // shrink below its content's min-content size inside a flex parent (see
    // the :host(.auto-fit) rule in the stylesheet).
    host: { "[class.auto-fit]": "autoFit" },
})
export class AvatarStackComponent implements AfterViewInit, OnDestroy {
  // Pre-resolved by the caller (UserIdentityService.resolve$) — this component
  // is purely presentational and has no idea how identities get resolved.
  @Input({ required: true }) identities: readonly ResolvedIdentity[] = [];
  @Input() size: AvatarSize = "xs";
  @Input() max = 4;

  // When set, `size`/`max` above become the *largest* candidate rather than a
  // fixed value: a ResizeObserver on the host measures the width the
  // surrounding layout actually gives this stack and fitStack() picks the
  // largest candidate (defaulting to defaultAvatarStackCandidates(size, max),
  // overridable via [autoFitCandidates]) that fits it. Without this input the
  // component behaves exactly as before, so existing call sites are unaffected.
  @Input() autoFit = false;
  @Input() autoFitCandidates?: readonly AvatarStackCandidate[];

  // Optional: a poll page can wire this to open its existing voter filter menu.
  // Left unbound, the stack just isn't clickable — see .clickable in the template.
  @Output() stackClicked = new EventEmitter<void>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private resizeObserver?: ResizeObserver;
  private measuredWidthPx: number | null = null;

  ngAfterViewInit(): void {
    if (!this.autoFit || typeof ResizeObserver === "undefined") {
      return;
    }

    // Measure synchronously, before the browser's first paint: the host's
    // `overflow: hidden` (see :host(.auto-fit) in the stylesheet) is active
    // from frame one, but without this, the content it clips still reflects
    // the unfit size/max (this.size/this.max) until ResizeObserver's async
    // callback lands — so real devices, which take longer to reach that
    // first callback, briefly paint an unfit avatar row clipped inside
    // whatever width the flex row happened to squeeze the host to. That
    // showed up on Android as the participant stack appearing then getting
    // cut off right after the page rendered.
    const initialWidth = this.elementRef.nativeElement.getBoundingClientRect().width;
    if (initialWidth > 0) {
      this.measuredWidthPx = initialWidth;
      this.changeDetectorRef.detectChanges();
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width == null || width === this.measuredWidthPx) {
        return;
      }
      this.measuredWidthPx = width;
      this.changeDetectorRef.markForCheck();
    });
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  get effectiveSize(): AvatarSize {
    return this.fit?.size ?? this.size;
  }

  get effectiveMax(): number {
    return this.fit?.max ?? this.max;
  }

  // The width this stack actually needs right now — however many avatars are
  // shown, plus the overflow chip if there's one. Bound as an explicit style
  // (see the template) rather than left to the browser to figure out: a
  // caller whose layout reserves room around this component (movie-poll-item's
  // .controls, in particular) needs to know precisely how wide the content
  // is, not just "as wide as the browser feels like making the inline-flex
  // box" — that ambiguity is what let the stack overflow its column in the
  // first place. Grows with the actual vote count rather than reserving
  // max + 1 always, so callers that size themselves to this value don't pay
  // for room a low-vote item isn't using either. In autoFit mode this isn't
  // bound in the template (the host is left to flex-shrink instead), but it's
  // kept accurate regardless since callers may still read it directly.
  get reservedWidthPx(): number {
    return reservedWidthPxFor(this.effectiveSize, this.identities.length, this.effectiveMax);
  }

  get visible(): readonly ResolvedIdentity[] {
    return this.identities.length > this.effectiveMax
      ? this.identities.slice(0, this.effectiveMax - 1)
      : this.identities;
  }

  get overflowCount(): number {
    return this.identities.length > this.effectiveMax
      ? this.identities.length - (this.effectiveMax - 1)
      : 0;
  }

  get tooltip(): string {
    return this.identities.length === 0
      ? "Be the first voter! ✨"
      : this.identities.map((identity) => identity.displayName).join(", ");
  }

  private get fit(): AvatarStackFit | null {
    if (!this.autoFit || this.measuredWidthPx == null) {
      return null;
    }
    const candidates = this.autoFitCandidates ?? defaultAvatarStackCandidates(this.size, this.max);
    return fitStack(this.identities.length, this.measuredWidthPx, candidates);
  }
}
