import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";
import { NgClass } from "@angular/common";

@Component({
    selector: "point-vote-stepper",
    templateUrl: "./point-vote-stepper.component.html",
    styleUrls: ["./point-vote-stepper.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgClass],
})
export class PointVoteStepperComponent {
  @Input() points = 0;
  @Input() canAdd = false;
  @Input() canRemove = false;
  // Mirrors VoterComponent's own `size` input — the caller binds both from the same
  // condensedView expression, so the stepper's buttons/padding shrink to fit the
  // voter-container's own 32px "size-s" width instead of overflowing it.
  @Input() size: 's' | 'm' = 'm';
  @Output() add = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  addClicked(event: Event) {
    event.stopPropagation();
    if (!this.canAdd) {
      return;
    }
    this.add.emit();
  }

  removeClicked(event: Event) {
    event.stopPropagation();
    if (!this.canRemove) {
      return;
    }
    this.remove.emit();
  }
}
