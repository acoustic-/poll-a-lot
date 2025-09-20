import { Component, OnInit, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { UserService } from "../user.service";

@Component({
    selector: "app-login-dialog",
    templateUrl: "./login-dialog.component.html",
    styleUrls: ["./login-dialog.component.scss"],
    standalone: false
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
