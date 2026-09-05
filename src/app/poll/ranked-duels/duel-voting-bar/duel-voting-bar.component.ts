import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { DuelCtaKind, DuelCtaState } from "../duel-cta";

/**
 * The floating "duel" bar over the poll — same idiom as <point-voting-bar>:
 * fixed to the bottom of the viewport so it's reachable no matter how far the
 * voter has scrolled through the poll's cards, not just a normal in-flow
 * block that scrolls away with them. Purely presentational: `state` (from
 * `duelCtaState()`) decides the copy and colour; `action` fires the current
 * `kind` when the button is tapped (the poll page redoes vs. resumes off that).
 */
@Component({
  selector: "duel-voting-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./duel-voting-bar.component.scss"],
  template: `
    @if (state) {
      <div class="dvb-bar">
        <span class="dvb-pill" [attr.data-kind]="state.kind">
          <span class="dvb-txt">
            <span class="dvb-k">{{ state.headline }}</span>
            <span class="dvb-sub">{{ state.sub }}</span>
          </span>
          <button type="button" class="dvb-act" (click)="action.emit(state.kind)">
            {{ state.action }}
          </button>
        </span>
      </div>
    }
  `,
})
export class DuelVotingBarComponent {
  @Input() state: DuelCtaState | null = null;
  @Output() action = new EventEmitter<DuelCtaKind>();
}
