import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";
import { PollItem } from "../../model/poll";
import { PollItemVoter, voterKey } from "../poll/poll.component";
import { BehaviorSubject, map, Observable } from "rxjs";
import { User } from "../../model/user";

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
  
  selectedVoters$ = new BehaviorSubject<PollItemVoter[]>([]);

  @Input() set selectedVoters(value: PollItemVoter[]) {
    this.selectedVoters$.next(value);
  }
  @Output() onClick = new EventEmitter<void>();

  voters$: Observable<User[]>;

  constructor() {
    this.voters$ = this.selectedVoters$.pipe(
      map(selectedVoters => {
        if (selectedVoters.length) {
          return this.pollItem.voters.filter(voter => {
            const key = voterKey(voter);
            return selectedVoters.some(selected => selected.selected === true && voterKey(selected) === key);
          });
        }
        return this.pollItem.voters;
      })
    );
  }

  clicked() {
    this.onClick.emit();
  }
}
