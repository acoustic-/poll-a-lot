import { TestBed, waitForAsync } from "@angular/core/testing";
import {
  AvatarStackCandidate,
  AvatarStackComponent,
  defaultAvatarStackCandidates,
  fitStack,
  reservedWidthPxFor,
} from "./avatar-stack.component";
import { AvatarSize } from "../user-avatar/user-avatar.component";
import { ResolvedIdentity } from "../user-identity.service";

// Mirrors the BOX_SIZE/OVERLAP tables in avatar-stack.component.ts (they're
// not exported — these are the fixed per-size box/overlap pixel values the
// component's own doc comment says must stay in sync with the SCSS).
const BOX_SIZE: Record<AvatarSize, number> = { xxs: 16, xs: 22, s: 30, m: 38, l: 98 };
const OVERLAP: Record<AvatarSize, number> = { xxs: 5, xs: 8, s: 8, m: 8, l: 8 };

function expectedWidth(size: AvatarSize, count: number, max: number): number {
  const box = BOX_SIZE[size];
  const overlap = OVERLAP[size];
  const items = Math.min(count, max);
  return items > 0 ? box + (items - 1) * (box - overlap) : 0;
}

function identity(key: string): ResolvedIdentity {
  return { key, displayName: key, photoURL: null, initials: "X", color: "#000", isLive: false };
}

describe("reservedWidthPxFor", () => {
  it("matches the size/count/max arithmetic for every AvatarSize", () => {
    const sizes: AvatarSize[] = ["xxs", "xs", "s", "m", "l"];
    for (const size of sizes) {
      for (const count of [0, 1, 3, 12, 50]) {
        for (const max of [1, 4, 6]) {
          expect(reservedWidthPxFor(size, count, max)).toBe(expectedWidth(size, count, max));
        }
      }
    }
  });

  it("is 0 when there are no identities to show", () => {
    expect(reservedWidthPxFor("m", 0, 6)).toBe(0);
  });
});

describe("defaultAvatarStackCandidates", () => {
  it("starts at the requested size/max and degrades max down to 1 before dropping to the next smaller size", () => {
    expect(defaultAvatarStackCandidates("xs", 4)).toEqual([
      { size: "xs", max: 4 },
      { size: "xs", max: 3 },
      { size: "xs", max: 2 },
      { size: "xs", max: 1 },
      { size: "xxs", max: 4 },
      { size: "xxs", max: 3 },
      { size: "xxs", max: 2 },
      { size: "xxs", max: 1 },
    ]);
  });

  it("never proposes a size larger than the one requested", () => {
    expect(defaultAvatarStackCandidates("s", 2)).toEqual([
      { size: "s", max: 2 },
      { size: "s", max: 1 },
      { size: "xs", max: 2 },
      { size: "xs", max: 1 },
      { size: "xxs", max: 2 },
      { size: "xxs", max: 1 },
    ]);
  });
});

describe("fitStack", () => {
  const candidates: AvatarStackCandidate[] = [
    { size: "m", max: 6 },
    { size: "s", max: 6 },
    { size: "xs", max: 6 },
    { size: "xxs", max: 6 },
    { size: "xxs", max: 3 },
    { size: "xxs", max: 1 },
  ];

  it("always returns a candidate whose reserved width fits, for a range of counts and widths", () => {
    for (const count of [0, 1, 3, 12, 50]) {
      for (const availableWidthPx of [40, 80, 120, 400]) {
        const fit = fitStack(count, availableWidthPx, candidates);
        expect(fit.widthPx).toBeLessThanOrEqual(availableWidthPx);
        expect(fit.widthPx).toBe(expectedWidth(fit.size, count, fit.max));
      }
    }
  });

  it("picks the largest candidate that fits — the top candidate itself when it already fits", () => {
    expect(fitStack(3, 400, candidates)).toEqual({ size: "m", max: 6, widthPx: 98 });
    expect(fitStack(12, 400, candidates)).toEqual({ size: "m", max: 6, widthPx: 188 });
  });

  it("degrades size and max monotonically as available width shrinks", () => {
    const widths = [400, 120, 80, 40].map((availableWidthPx) => fitStack(12, availableWidthPx, candidates).widthPx);
    expect(widths).toEqual([188, 92, 71, 38]);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
    }
  });

  it("falls back to the smallest candidate — even if it doesn't actually fit — when nothing does", () => {
    const fit = fitStack(50, 10, candidates);
    expect(fit).toEqual({ size: "xxs", max: 1, widthPx: 16 });
    expect(fit.widthPx).toBeGreaterThan(10);
  });
});

describe("AvatarStackComponent", () => {
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({ imports: [AvatarStackComponent] }).compileComponents();
  }));

  it("reservedWidthPx matches reservedWidthPxFor for every AvatarSize", () => {
    const sizes: AvatarSize[] = ["xxs", "xs", "s", "m", "l"];
    const identities = [identity("a"), identity("b"), identity("c"), identity("d")];
    for (const size of sizes) {
      const fixture = TestBed.createComponent(AvatarStackComponent);
      fixture.componentRef.setInput("identities", identities);
      fixture.componentRef.setInput("size", size);
      fixture.componentRef.setInput("max", 3);
      fixture.detectChanges();
      expect(fixture.componentInstance.reservedWidthPx).toBe(reservedWidthPxFor(size, identities.length, 3));
    }
  });

  it("reservedWidthPx is 0 when there are no identities", () => {
    const fixture = TestBed.createComponent(AvatarStackComponent);
    fixture.componentRef.setInput("identities", []);
    fixture.detectChanges();
    expect(fixture.componentInstance.reservedWidthPx).toBe(0);
  });

  it("computes fit synchronously after ngAfterViewInit, without waiting for a ResizeObserver tick", () => {
    const fixture = TestBed.createComponent(AvatarStackComponent);
    fixture.componentRef.setInput("identities", [identity("a"), identity("b")]);
    fixture.componentRef.setInput("autoFit", true);
    // Before the synchronous getBoundingClientRect() measurement in
    // ngAfterViewInit, `fit` stayed null here — the host's overflow: hidden
    // was already active (see :host(.auto-fit) in the stylesheet) while the
    // rendered content still reflected the raw, unfit size/max, until an
    // async ResizeObserver callback happened to land afterwards.
    fixture.detectChanges();
    expect(fixture.componentInstance.effectiveSize).toBeDefined();
    expect(fixture.nativeElement.querySelectorAll("user-avatar").length).toBeGreaterThan(0);
  });
});
