import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";

@Component({
  selector: "point-voting-bar",
  templateUrl: "./point-voting-bar.component.html",
  styleUrls: ["./point-voting-bar.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class PointVotingBarComponent {
  @Input() budget = 0;
  @Input() used = 0;
  // `undefined`/`null` both mean "no cap" (see canAddPoint in poll-item.service.ts)
  @Input() maxPerItem?: number | null;
  @Output() clearVotes = new EventEmitter<void>();
}
