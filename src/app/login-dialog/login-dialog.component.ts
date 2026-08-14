import { Component, OnInit, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

// Narrowed to what this dialog actually calls, rather than importing UserService
// itself — UserService opens this dialog, so importing it back here would close
// an import cycle (see docs/regression-test-plan.md, D1/F1).
interface LoginDialogUserService {
  login(): void;
}

@Component({
    selector: "app-login-dialog",
    templateUrl: "./login-dialog.component.html",
    styleUrls: ["./login-dialog.component.scss"],
    standalone: false
})
export class LoginDialogComponent implements OnInit {
  private userService: LoginDialogUserService;
  constructor(
    public dialogRef: MatDialogRef<LoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      nickname: string;
      userService: LoginDialogUserService;
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
