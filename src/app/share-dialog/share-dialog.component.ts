import { Component, inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose } from "@angular/material/dialog";
import { PollItemService } from "../poll-item.service";
import { CdkScrollable } from "@angular/cdk/scrolling";
import { PollLinkCopyComponent } from "../poll-link-copy/poll-link-copy.component";
import { MatButton } from "@angular/material/button";

@Component({
    selector: "app-share-dialog",
    templateUrl: "./share-dialog.component.html",
    styleUrls: ["./share-dialog.component.scss"],
    imports: [MatDialogTitle, CdkScrollable, MatDialogContent, PollLinkCopyComponent, MatButton, MatDialogActions, MatDialogClose]
})
export class ShareDialogComponent {
  dialogRef = inject<MatDialogRef<ShareDialogComponent>>(MatDialogRef);
  input = inject<{
    id: string;
    name: string;
    pollDescription?: string;
}>(MAT_DIALOG_DATA);
  private pollItemService = inject(PollItemService);

  _navigator = window.navigator;

  pollId: string;

  constructor() {
    this.pollId = this.input.id;
  }

  share() {
    if (this._navigator && this._navigator.share) {
      this._navigator
        .share({
          title: "Poll-A-Lot | Poll sharing made easy!",
          text: "I need your opinion. Please vote: " + this.input.name,
          url: this.pollItemService.getPollUrl(this.pollId),
        })
        .then(() => {
          console.log("Successful share");
          // gtag('event', 'share');
        })
        .catch((error) => console.log("Error sharing", error));
    }
  }
}
