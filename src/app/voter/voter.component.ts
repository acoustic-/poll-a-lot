import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from "@angular/core";
import { PollItem } from "../../model/poll";
import { PollItemVoter } from "../poll/poll-voters";
import { voterKey } from "../user-identity";
import { BehaviorSubject, combineLatest, map, Observable } from "rxjs";
import { User } from "../../model/user";
import { ResolvedIdentity } from "../user-identity.service";
import { MatRipple } from "@angular/material/core";
import { NgClass, AsyncPipe } from "@angular/common";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIcon } from "@angular/material/icon";

@Component({
    selector: "voter",
    templateUrl: "./voter.component.html",
    styleUrls: ["./voter.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatRipple, NgClass, MatTooltip, MatIcon, AsyncPipe]
})
export class VoterComponent {
  // Backed by a subject (not a plain field) so `voters$` below can recompute when the
  // poll item itself changes (e.g. a new vote lands), not only when the voter filter
  // changes — plain and series poll items never bind [selectedVoters] at all, so
  // without this, voters$ would compute once at construction and freeze forever.
  private pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);

  @Input() set pollItem(value: PollItem) {
    this.pollItem$.next(value);
  }
  get pollItem(): PollItem {
    return this.pollItem$.value;
  }

  @Input() hasVoted = false;
  @Input() size: 's' | 'm' = 'm';
  @Input() locked: boolean;

  // Plain @Input(), not content-projection detection: OnPush already reacts to an
  // @Input() reference/value change for free, so this stays correctly reactive when
  // a caller flips ranked point voting on/off (e.g. right after saving the edit-poll
  // dialog) with no extra plumbing. Always bind this from the exact same expression
  // that gates whether a <point-vote-stepper> is projected below, so the two can't
  // drift out of sync.
  @Input() pointVoting = false;

  // The current user's own points on this item — same value callers already pass to
  // <point-vote-stepper>'s [points]. Needed so the .voted highlight can reflect
  // "do I currently have points here" rather than `hasVoted`'s plain voters[]
  // membership: a voter can hold a voters[] entry (hasVoted === true) while sitting
  // at 0 points — either a legacy binary vote never touched under ranked voting, or
  // one they've stepped back down to 0 — and in point-voting mode that should read
  // as unvoted, not highlighted.
  @Input() myPoints = 0;
  @Input() voterIdentities: ResolvedIdentity[] = [];

  get isVoted(): boolean {
    return this.pointVoting ? this.myPoints > 0 : this.hasVoted;
  }

  selectedVoters$ = new BehaviorSubject<PollItemVoter[]>([]);

  @Input() set selectedVoters(value: PollItemVoter[]) {
    this.selectedVoters$.next(value);
  }
  @Output() onClick = new EventEmitter<void>();

  voters$: Observable<User[]>;

  constructor() {
    this.voters$ = combineLatest([this.pollItem$, this.selectedVoters$]).pipe(
      map(([pollItem, selectedVoters]) => {
        if (!pollItem) {
          return [];
        }
        if (selectedVoters.length) {
          return pollItem.voters.filter(voter => {
            const key = voterKey(voter);
            return selectedVoters.some(selected => selected.selected === true && voterKey(selected) === key);
          });
        }
        return pollItem.voters;
      })
    );
  }

  clicked() {
    if (this.pointVoting) {
      return;
    }
    this.onClick.emit();
  }

  voterTooltip(voters: User[]): string {
    if (!voters?.length) return '';
    const identityMap = new Map(this.voterIdentities.map(id => [id.key, id.displayName]));
    const names = voters.map(v => identityMap.get(v.id || v.localUserId || v.name || '') ?? v.name);
    return `Voters: ${names.join(', ')}`;
  }

  // Badge total: point-weighted sum in ranked-point-voting mode (legacy entries with
  // no `points` field yet count as 0, same as getUserPoints — nobody's credited a
  // point they never spent from their budget), plain voter count otherwise.
  votesTotal(voters: (User & { points?: number })[]): number {
    if (!voters) {
      return 0;
    }
    return this.pointVoting
      ? voters.reduce((sum, v) => sum + (v.points ?? 0), 0)
      : voters.length;
  }
}
