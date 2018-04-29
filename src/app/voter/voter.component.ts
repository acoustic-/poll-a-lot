import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PollItem } from '../../model/poll';

@Component({
  selector: 'voter',
  templateUrl: './voter.component.html',
  styleUrls: ['./voter.component.scss']
})
export class VoterComponent {

  @Input() pollItem: PollItem;
  @Input() hasVoted: boolean = false;
  @Output() onClick = new EventEmitter<void>();

  constructor() { }

  clicked() {
    this.onClick.emit();
  }

  getVotersText(pollItem: PollItem): string {
    return `Voters: ${pollItem.voters.map(voter => voter.name).join(', ')}`;
  }
}
