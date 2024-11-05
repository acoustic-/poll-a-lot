import { Component, OnInit, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { PollItemService } from "../poll-item.service";

@Component({
  selector: "app-share-dialog",
  templateUrl: "./share-dialog.component.html",
  styleUrls: ["./share-dialog.component.scss"],
})
export class ShareDialogComponent implements OnInit {
  _navigator: any = window.navigator;

  pollId: string;

  constructor(
    public afAuth: AngularFireAuth,
    public dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public input: { id: string; name: string, pollDescription?: string },
    private pollItemService: PollItemService,
  ) {
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
