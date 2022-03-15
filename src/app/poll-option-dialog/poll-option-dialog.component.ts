import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PollItem } from '../../model/poll';
import { fadeInOut } from '../shared/animations';

@Component({
  selector: 'poll-option-dialog',
  templateUrl: './poll-option-dialog.component.html',
  styleUrls: ['./poll-option-dialog.component.scss'],
  animations: [ fadeInOut ],
})
export class PollOptionDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<PollOptionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public pollItem: PollItem,
  ) {
  }

  showLoading = true;

  ngOnInit() {

    setTimeout(() => {
      this.showLoading = false;
    }, 1000);
  }

  onOk() {
    this.dialogRef.close(this.pollItem);
  }
}
