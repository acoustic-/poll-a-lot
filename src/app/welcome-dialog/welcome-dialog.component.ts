import { ChangeDetectionStrategy, Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";

import { LoginButtonComponent } from "../login-button/login-button.component";

@Component({
  selector: "app-welcome-dialog",
  templateUrl: "./welcome-dialog.component.html",
  styleUrls: ["./welcome-dialog.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [MatDialogModule, MatIconModule, LoginButtonComponent],
})
export class WelcomeDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA)
    // Narrowed to what this dialog actually calls, rather than importing
    // UserService itself — UserService opens this dialog, so importing it back
    // here would close an import cycle (see docs/regression-test-plan.md, D1/F1).
    public data: { userService: { login(): void } }
  ) {}

  login(): void {
    this.data.userService.login();
  }
}
