import { Injectable, OnDestroy } from "@angular/core";
import { ViewportScroller } from "@angular/common";
import { MovieDialogData } from "../model/movie-dialog";
import { MovieDialog } from "./movie-poll-item/movie-dialog/movie-dialog";
import { defaultDialogHeight, defaultDialogOptions } from "./common";
import { MatDialog, MatDialogRef } from "@angular/material/dialog";
import { NEVER } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class MovieDialogService implements OnDestroy {
  subs = NEVER.subscribe();
  private parentScrollPosition: [number, number ] | undefined;

  constructor(
    private dialog: MatDialog,
    private viewportScroller: ViewportScroller
  ) {}

  openMovie(data: MovieDialogData): MatDialogRef<MovieDialog, MovieDialogData> {
    this.parentScrollPosition = this.viewportScroller.getScrollPosition();

    const dialogRef = this.dialog.open(MovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data,
    });

    if (this.parentScrollPosition) {
      this.subs.add(
        dialogRef
          .afterClosed()
          .subscribe(() => {
            setTimeout(() => {
                this.viewportScroller.scrollToPosition(this.parentScrollPosition)
            });
        })
      );
    }

    return dialogRef;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
