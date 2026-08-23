import { Component, OnInit, inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogClose, MatDialogActions } from "@angular/material/dialog";
import { CdkScrollable } from "@angular/cdk/scrolling";
import { LoginButtonComponent } from "../login-button/login-button.component";
import { MatFormField, MatInput } from "@angular/material/input";
import { FormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";

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
    imports: [MatDialogTitle, CdkScrollable, MatDialogContent, LoginButtonComponent, MatFormField, MatInput, FormsModule, MatButton, MatDialogClose, MatDialogActions]
})
export class LoginDialogComponent implements OnInit {
  dialogRef = inject<MatDialogRef<LoginDialogComponent>>(MatDialogRef);
  data = inject<{
    nickname: string;
    userService: LoginDialogUserService;
    requireStrongAuth: boolean;
}>(MAT_DIALOG_DATA);

  private userService: LoginDialogUserService;
  constructor() {
    const data = this.data;

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
