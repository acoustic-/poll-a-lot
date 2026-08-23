import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
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
  dialogRef = inject<MatDialogRef<PollOptionDialogComponent>>(MatDialogRef);
  pollItem = inject<PollItem>(MAT_DIALOG_DATA);


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
