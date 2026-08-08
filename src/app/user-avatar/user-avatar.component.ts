import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { ResolvedIdentity } from "../user-identity.service";

export type AvatarSize = "xxs" | "xs" | "s" | "m" | "l";

export const AVATAR_PIXEL_SIZES: Record<AvatarSize, number> = { xxs: 14, xs: 20, s: 28, m: 36, l: 96 };

// Google serves a fairly large default photo; requesting roughly the rendered
// size (at 2x, for retina) avoids pulling way more than a 20px stack chip
// needs. Non-Google photo URLs are left unchanged.
export function sizedGooglePhotoUrl(url: string, displaySize: number): string {
  if (!url.includes("googleusercontent.com")) {
    return url;
  }
  const target = Math.round(displaySize * 2);
  return /=s\d+/.test(url) ? url.replace(/=s\d+/, `=s${target}`) : `${url}=s${target}-c`;
}

@Component({
    selector: "user-avatar",
    templateUrl: "./user-avatar.component.html",
    styleUrls: ["./user-avatar.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent implements OnChanges {
  @Input({ required: true }) identity!: ResolvedIdentity;
  @Input() size: AvatarSize = "m";

  // Plain field, not a signal/BehaviorSubject: OnPush already re-renders after
  // any DOM event handler on this component fires (the (error) binding below),
  // so no reactive primitive is needed for a single boolean flipped once.
  imageFailed = false;

  get sizedPhotoUrl(): string | null {
    return this.identity?.photoURL
      ? sizedGooglePhotoUrl(this.identity.photoURL, AVATAR_PIXEL_SIZES[this.size])
      : null;
  }

  onImageError(): void {
    this.imageFailed = true;
  }

  // avatar-stack reuses this component instance across identity updates that
  // share the same key (@for track). Without this, a transient photo-load
  // failure would permanently pin the instance to the initials fallback even
  // after a later re-resolution supplies a working photoURL for that key.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["identity"]) {
      this.imageFailed = false;
    }
  }
}
