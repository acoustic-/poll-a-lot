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
    this.url = url.replace('add-poll', `poll/${this.input.id}`);
    this.copied = false;
  }

  ngOnInit() {
  }

  share() {
    if (this._navigator && this._navigator.share) {
      this._navigator.share({
        title: 'Poll-A-Lot',
        text: this.input.name,
        url: this.url,
      })
        .then(() => console.log('Successful share'))
        .catch((error) => console.log('Error sharing', error));
    }
  }
}
