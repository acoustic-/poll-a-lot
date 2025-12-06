import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Inject,
  OnInit,
} from "@angular/core";
import { Poll, PollItem } from "../../../model/poll";
import { fadeInOut } from "../../shared/animations";
import { FormControl } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet } from "@angular/material/bottom-sheet";
import { Router } from "@angular/router";

@Component({
    selector: "app-edit-poll-dialog",
    templateUrl: "./edit-poll-dialog.component.html",
    styleUrls: ["./edit-poll-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [fadeInOut],
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
      this.poll.locked === updated.locked
    );
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
    this.bottomSheetRef.dismiss(this.pollTemp);
  }

  close() {
    this.bottomSheetRef.dismiss();
  }
}
