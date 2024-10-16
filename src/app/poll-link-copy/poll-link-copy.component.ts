import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {ClipboardModule} from '@angular/cdk/clipboard'; 
import { Router } from '@angular/router';
import { PollItemService } from '../poll-item.service';
import { BehaviorSubject, timer } from 'rxjs';

@Component({
  selector: 'poll-link-copy',
  standalone: true,
  imports: [ ClipboardModule, CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule ],
  templateUrl: './poll-link-copy.component.html',
  styleUrl: './poll-link-copy.component.scss'
})
export class PollLinkCopyComponent implements OnInit {
  @Input() pollId: string;
  @Input() pollName: string;
  pollUrl: string;

  activated$ = new BehaviorSubject<boolean>(false);

  constructor(private snackBar: MatSnackBar, private router: Router, private pollItemService: PollItemService) {
  }

  ngOnInit() {
    this.pollUrl = `🍿 Poll-A-Lot: ${this.pollName} ${this.pollItemService.getPollUrl(this.pollId)}`;
  }

  afterCopied() {
    this.activated$.next(true);
    timer(5000).subscribe(() => { this.activated$.next(false)})
    this.snackBar.open(
      "Poll link copied!",
      undefined,
      { duration: 5000 }
    );
  }
}
