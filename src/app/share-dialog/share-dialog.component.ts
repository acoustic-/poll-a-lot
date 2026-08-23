import { Component, OnInit, inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { PollItemService } from "../poll-item.service";

@Component({
    selector: "app-share-dialog",
    templateUrl: "./share-dialog.component.html",
    styleUrls: ["./share-dialog.component.scss"],
    standalone: false
})
export class ShareDialogComponent implements OnInit {
  dialogRef = inject<MatDialogRef<ShareDialogComponent>>(MatDialogRef);
  input = inject<{
    id: string;
    name: string;
    pollDescription?: string;
}>(MAT_DIALOG_DATA);
  private pollItemService = inject(PollItemService);

  _navigator: any = window.navigator;

  pollId: string;

  constructor() {
    this.pollId = this.input.id;
  }

  ngOnInit() {}

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
