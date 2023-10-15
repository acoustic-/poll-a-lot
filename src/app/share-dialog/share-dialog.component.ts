import { Component, OnInit, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { AngularFireAuth } from "@angular/fire/compat/auth";

@Component({
  selector: "app-share-dialog",
  templateUrl: "./share-dialog.component.html",
  styleUrls: ["./share-dialog.component.scss"],
})
export class ShareDialogComponent implements OnInit {
  _navigator: any = window.navigator;
  copied: boolean;
  btnColor: string;

  url: string;
  constructor(
    public afAuth: AngularFireAuth,
    public dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public input: { id: string; name: string }
  ) {
    let url = document.location.href;
    url = url.replace("add-poll", "");
    url = url.replace("manage", "");
    url = url.replace(`poll/${this.input.id}`, "");
    this.url = url + "poll/" + this.input.id;
    this.copied = false;
  }

  ngOnInit() {}

  share() {
    if (this._navigator && this._navigator.share) {
      this._navigator
        .share({
          title: "Poll-A-Lot | Poll sharing made easy!",
          text: "I need your opinion. Please vote: " + this.input.name,
          url: this.url,
        })
        .then(() => {
          console.log("Successful share");
          // gtag('event', 'share');
        })
        .catch((error) => console.log("Error sharing", error));
    }
  }
}
