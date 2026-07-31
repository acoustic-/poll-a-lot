import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { MatTooltipModule } from "@angular/material/tooltip";
import { UserAvatarComponent, AvatarSize } from "../user-avatar/user-avatar.component";
import { ResolvedIdentity } from "../user-identity.service";

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

  get visible(): readonly ResolvedIdentity[] {
    return this.identities.slice(0, this.max);
  }

  get overflowCount(): number {
    return Math.max(0, this.identities.length - this.max);
  }

  get tooltip(): string {
    return this.identities.length === 0
      ? "Be the first voter! ✨"
      : this.identities.map((identity) => identity.displayName).join(", ");
  }
}
