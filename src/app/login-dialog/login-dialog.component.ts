import { Component, OnInit, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { UserService } from "../user.service";
import "rxjs/add/operator/first";
import { takeUntil } from "rxjs/operators";

@Component({
  selector: "app-login-dialog",
  templateUrl: "./login-dialog.component.html",
  styleUrls: ["./login-dialog.component.scss"],
})
export class LoginDialogComponent implements OnInit {
  private userService: UserService;
  constructor(
    public dialogRef: MatDialogRef<LoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      nickname: string;
      userService: UserService;
      requireStrongAuth: boolean;
    }
  ) {
    this.userService = data.userService;
    this.userService.user$
      .first(
        (user) =>
          user !== undefined &&
          (this.data.requireStrongAuth === true ? user.id !== undefined : true)
      )
      .pipe(takeUntil(this.dialogRef.afterClosed()))
      .subscribe((user) => {
        // gtag('event', 'login', { method: user.id ? 'Google' : 'anonymous'});
        this.dialogRef.close();
      });
  }

  _nickname: string | undefined = undefined;

  ngOnInit() {}

  login() {
    this.userService.login();
  }

  trim(input: string) {
    this.data.nickname = input.trim();
  }
}
