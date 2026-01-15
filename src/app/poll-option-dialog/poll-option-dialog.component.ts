import { Component, OnInit, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PollItem } from '../../model/poll';
import { BehaviorSubject } from 'rxjs';

@Component({
    selector: 'poll-option-dialog',
    templateUrl: './poll-option-dialog.component.html',
    styleUrls: ['./poll-option-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class PollOptionDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<PollOptionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public pollItem: PollItem,
  ) {
  }

  showLoading$ = new BehaviorSubject<boolean>(true);

  ngOnInit() {
    setTimeout(() => {
      this.showLoading$.next(false);
    }, 1000);
  }

  onOk() {
    this.dialogRef.close(this.pollItem);
  }
}
