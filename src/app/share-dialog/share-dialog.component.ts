import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { AngularFireAuth } from 'angularfire2/auth';
import * as firebase from 'firebase/app';

@Component({
  selector: 'app-share-dialog',
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent implements OnInit {

  _navigator: any = window.navigator;
  copied: boolean;
  btnColor: string;

  url: string;
  constructor(
    public afAuth: AngularFireAuth,
    public dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public input: { id: string, name: string },
  ) {
    let url = document.location.href;
    url = url.replace('add-poll', '');
    url = url.replace('manage', '');    
    this.url = url + 'poll/' + this.input.id;
    console.log("url", this.url)
    this.copied = false;
  }

  ngOnInit() {
  }

  share() {
    if (this._navigator && this._navigator.share) {
      this._navigator.share({
        title: 'Poll-A-Lot | Poll sharing made easy!',
        text: 'Your friend would like you opinion on: ' + this.input.name,
        url: this.url,
      })
        .then(() => console.log('Successful share'))
        .catch((error) => console.log('Error sharing', error));
    }
  }
}
