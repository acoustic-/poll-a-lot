import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
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

@Component({
    selector: "avatar-stack",
    templateUrl: "./avatar-stack.component.html",
    styleUrls: ["./avatar-stack.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [UserAvatarComponent, MatTooltipModule],
})
export class AvatarStackComponent {
  // Pre-resolved by the caller (UserIdentityService.resolve$) — this component
  // is purely presentational and has no idea how identities get resolved.
  @Input({ required: true }) identities: readonly ResolvedIdentity[] = [];
  @Input() size: AvatarSize = "xs";
  @Input() max = 4;

  // Optional: a poll page can wire this to open its existing voter filter menu.
  // Left unbound, the stack just isn't clickable — see .clickable in the template.
  @Output() stackClicked = new EventEmitter<void>();

  // The width this stack actually needs right now — however many avatars are
  // shown, plus the overflow chip if there's one. Bound as an explicit style
  // (see the template) rather than left to the browser to figure out: a
  // caller whose layout reserves room around this component (movie-poll-item's
  // .controls, in particular) needs to know precisely how wide the content
  // is, not just "as wide as the browser feels like making the inline-flex
  // box" — that ambiguity is what let the stack overflow its column in the
  // first place. Grows with the actual vote count rather than reserving
  // max + 1 always, so callers that size themselves to this value don't pay
  // for room a low-vote item isn't using either.
  get reservedWidthPx(): number {
    const box = BOX_SIZE[this.size];
    const overlap = OVERLAP[this.size];
    const items = this.visible.length + (this.overflowCount > 0 ? 1 : 0);
    return items > 0 ? box + (items - 1) * (box - overlap) : 0;
  }

  get visible(): readonly ResolvedIdentity[] {
    return this.identities.length > this.max
      ? this.identities.slice(0, this.max - 1)
      : this.identities;
  }

  get overflowCount(): number {
    return this.identities.length > this.max
      ? this.identities.length - (this.max - 1)
      : 0;
  }

  get tooltip(): string {
    return this.identities.length === 0
      ? "Be the first voter! ✨"
      : this.identities.map((identity) => identity.displayName).join(", ");
  }
}
