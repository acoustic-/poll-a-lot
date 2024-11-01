import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {ClipboardModule} from '@angular/cdk/clipboard'; 
import { Router } from '@angular/router';
import { PollItemService } from '../poll-item.service';
import { BehaviorSubject, timer } from 'rxjs';
import { TMDbService } from '../tmdb.service';

@Component({
  selector: 'poll-link-copy',
  standalone: true,
  imports: [ ClipboardModule, CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule ],
  templateUrl: './poll-link-copy.component.html',
  styleUrl: './poll-link-copy.component.scss'
})
export class PollLinkCopyComponent implements OnInit {
  @Input() pollId?: string;
  @Input() movieId?: string;
  @Input() name: string;
  copyContent: string;

  activated$ = new BehaviorSubject<boolean>(false);

  constructor(private snackBar: MatSnackBar, private router: Router, private pollItemService: PollItemService, private tmdbService: TMDbService) {
  }

  ngOnInit() {
    if (this.pollId) {
      this.copyContent = `🍿 Poll-A-Lot: ${this.name} ${this.pollItemService.getPollUrl(this.pollId)}`;
    } else if (this.movieId) {
      this.copyContent = `🎞️ Poll-A-Lot: ${this.name} ${this.tmdbService.getMovielUrl(this.movieId)}`;
    }
  }

  afterCopied() {
    this.activated$.next(true);
    timer(5000).subscribe(() => { this.activated$.next(false)})
    this.snackBar.open(
      "Link copied! 🔗",
      undefined,
      { duration: 5000 }
    );
  }
}
