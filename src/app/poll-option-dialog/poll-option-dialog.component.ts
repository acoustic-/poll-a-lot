import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogTitle, MatDialogActions, MatDialogClose } from '@angular/material/dialog';
import { PollItem } from '../../model/poll';
import { BehaviorSubject } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatCard } from '@angular/material/card';
import { TransitionGroupItemDirective } from '../transition-group-item.directive';
import { MoviePollItemComponent } from '../movie-poll-item/movie-poll-item.component';
import { SeriesPollItemComponent } from '../series-poll-item/series-poll-item.component';
import { MatButton } from '@angular/material/button';
import { AsyncPipe } from '@angular/common';

@Component({
    selector: 'poll-option-dialog',
    templateUrl: './poll-option-dialog.component.html',
    styleUrls: ['./poll-option-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatDialogTitle, MatIcon, MatCard, TransitionGroupItemDirective, MoviePollItemComponent, SeriesPollItemComponent, MatDialogActions, MatButton, MatDialogClose, AsyncPipe]
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
