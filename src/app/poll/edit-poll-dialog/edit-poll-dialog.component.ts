import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
} from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { Poll } from "../../../model/poll";
import { fadeInOut } from "../../shared/animations";
import { FormControl } from "@angular/forms";

@Component({
  selector: "app-edit-poll-dialog",
  templateUrl: "./edit-poll-dialog.component.html",
  styleUrls: ["./edit-poll-dialog.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeInOut],
})
export class EditPollDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<EditPollDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public poll: Poll
  ) {}

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
      this.poll.rankedMovieList === updated.rankedMovieList
    );
  }

  update() {
    this.dialogRef.close(this.pollTemp);
  }

  close() {
    this.dialogRef.close();
  }
}