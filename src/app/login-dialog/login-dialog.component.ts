import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { UserService } from '../user.service';
import { environment } from '../../environments/environment';
import 'rxjs/add/operator/first';

@Component({
  selector: 'app-login-dialog',
  templateUrl: './login-dialog.component.html',
  styleUrls: ['./login-dialog.component.scss']
})
export class LoginDialogComponent implements OnInit {
  private userService: UserService;
  constructor(
    public dialogRef: MatDialogRef<LoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { nickname: string, userService: UserService },
  ) {
    this.userService = data.userService;
    this.userService.user$.first(user => user !== undefined).subscribe(user => {
      gtag('event', 'login', { method: user.id ? 'Google' : 'anonymous'});
      this.dialogRef.close();
    });
  }

  ngOnInit() {
  }

  login() {
    this.userService.login();
  }
}
