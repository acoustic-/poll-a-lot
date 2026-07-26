import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Inject,
  OnInit,
} from "@angular/core";
import { Poll, PollItem } from "../../../model/poll";
import { FormControl } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet } from "@angular/material/bottom-sheet";
import { Router } from "@angular/router";
import { DEFAULT_POINT_VOTING_BUDGET } from "../../poll-item.service";

@Component({
    selector: "app-edit-poll-dialog",
    templateUrl: "./edit-poll-dialog.component.html",
    styleUrls: ["./edit-poll-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class EditPollDialogComponent implements OnInit {
  private bottomSheetRef = inject(MatBottomSheet);

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) data: { poll: Poll, pollItems: PollItem[]},
    private router: Router
  ) {
    this.poll = data.poll;
    this.pollItems = data.pollItems;
  }

  poll: Readonly<Poll>;
  pollItems: Readonly<PollItem[]>;
  pollTemp: Poll | undefined = undefined;

  // Transient, dialog-only: whether to wipe everyone's point-voting allocations on
  // Update. Not part of the Poll model — read off the dismissed result in
  // PollComponent.editPoll() and never itself written to Firestore.
  clearPointVotes = false;

  defaultPointVotingBudget = DEFAULT_POINT_VOTING_BUDGET;

  ngOnInit(): void {
    const assignedDate = this.poll.date
      ? (new FormControl(new Date(this.poll.date.seconds * 1000)).value as any)
      : null;
    this.pollTemp = Object.assign({}, { ...this.poll, date: assignedDate });
  }

  hasChanged(updated: Poll): boolean {
    return (
      this.poll.name === updated.name &&
      this.poll.description === updated.description &&
      new Date(this.poll.date?.seconds * 1000).valueOf() === new Date(updated.date as any).valueOf() &&
      this.poll.allowAdd === updated.allowAdd &&
      this.poll.showPollItemCreators === updated.showPollItemCreators &&
      this.poll.useSeenReaction === updated.useSeenReaction &&
      this.poll.movieList === updated.movieList &&
      this.poll.rankedMovieList === updated.rankedMovieList &&
      this.poll.locked === updated.locked &&
      this.poll.pointVoting?.pointVoting === updated.pointVoting?.pointVoting &&
      this.poll.pointVoting?.pointVotingBudget === updated.pointVoting?.pointVotingBudget &&
      this.poll.pointVoting?.pointVotingMaxPerItem === updated.pointVoting?.pointVotingMaxPerItem
    );
  }

  togglePointVoting(checked: boolean) {
    this.pollTemp.pointVoting = { ...this.pollTemp.pointVoting, pointVoting: checked };
    if (checked) {
      this.pollTemp.movieList = false;
      this.pollTemp.rankedMovieList = false;
      this.pollTemp.selectMultiple = true;
      this.pollTemp.pointVoting.pointVotingBudget =
        this.pollTemp.pointVoting.pointVotingBudget || DEFAULT_POINT_VOTING_BUDGET;
    }
  }

  setPointVotingBudget(budget: number) {
    this.pollTemp.pointVoting = { ...this.pollTemp.pointVoting, pointVotingBudget: budget };
    // `== null` (not `=== undefined`): a poll that's been saved once with "Unlimited"
    // comes back from Firestore as an explicit `null`, not `undefined` — both must
    // mean "no cap" here.
    if (
      this.pollTemp.pointVoting.pointVotingMaxPerItem != null &&
      this.pollTemp.pointVoting.pointVotingMaxPerItem > budget
    ) {
      this.pollTemp.pointVoting.pointVotingMaxPerItem = budget;
    }
  }

  // Options for the "max per item" select: [1, 2, ..., budget]. `{ length: budget }`
  // is an array-like with no real elements; the map callback's index argument `i`
  // (0-based) is shifted to `i + 1` so a budget of 5 yields [1,2,3,4,5] — the cap
  // options never exceed the current budget.
  pointVotingMaxPerItemOptions(): number[] {
    const budget = this.pollTemp.pointVoting?.pointVotingBudget || DEFAULT_POINT_VOTING_BUDGET;
    return Array.from({ length: budget }, (_, i) => i + 1);
  }

  // "Unlimited" (`pointVotingMaxPerItem` is `undefined`, or `null` once a poll has
  // been saved with it before — Firestore can't store `undefined`) has no single
  // consistent sentinel at the model layer, which is what made mat-select's
  // selection matching unreliable even with a `compareWith`. Sidestep that
  // entirely: the select only ever deals with real numbers, using -1 (never a valid
  // cap — caps start at 1) as its own local "Unlimited" sentinel, translated to/from
  // `pollTemp.pointVoting.pointVotingMaxPerItem` here.
  readonly UNLIMITED_MAX_PER_ITEM = -1;

  get maxPerItemSelection(): number {
    return this.pollTemp.pointVoting?.pointVotingMaxPerItem ?? this.UNLIMITED_MAX_PER_ITEM;
  }

  set maxPerItemSelection(value: number) {
    this.pollTemp.pointVoting = {
      ...this.pollTemp.pointVoting,
      pointVotingMaxPerItem: value === this.UNLIMITED_MAX_PER_ITEM ? undefined : value,
    };
  }

  async lockVoting(lock: boolean) {
    this.pollTemp.locked = lock ? new Date() as any : null;
  }

  duplicatePoll() {
    this.router.navigate(
      ['/add-poll'],
      {
        state: {
          poll: this.poll,
          pollItems: this.pollItems
        }
      }
    );
    this.close();
  }

  update() {
    this.bottomSheetRef.dismiss({
      ...this.pollTemp,
      clearPointVotes: this.clearPointVotes,
    });
  }

  close() {
    this.bottomSheetRef.dismiss();
  }
}
