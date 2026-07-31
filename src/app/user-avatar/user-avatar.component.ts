import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
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
export class UserAvatarComponent {
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
}
