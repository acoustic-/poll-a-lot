import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { PollItem } from '../../model/poll';

@Component({
  selector: 'poll-option-dialog',
  templateUrl: './poll-option-dialog.component.html',
  styleUrls: ['./poll-option-dialog.component.scss']
})
export class PollOptionDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<PollOptionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public pollItem: PollItem,
  ) {
  }

  ngOnInit() {
    console.log("random option", this.pollItem)
  }

  onOk() {
    this.dialogRef.close(this.pollItem);
  }

  onCancel() {
    this.dialogRef.close();
  }
}
