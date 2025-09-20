import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";
import { PollItem } from "../../model/poll";

@Component({
    selector: "voter",
    templateUrl: "./voter.component.html",
    styleUrls: ["./voter.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class VoterComponent {
  @Input() pollItem: PollItem;
  @Input() hasVoted = false;
  @Input() size: 's' | 'm' = 'm';
  @Input() locked: boolean;
  @Output() onClick = new EventEmitter<void>();

  constructor() {}

  clicked() {
    this.onClick.emit();
  }
}
