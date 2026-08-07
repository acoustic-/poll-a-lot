import { ChangeDetectionStrategy, Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";

import { LoginButtonComponent } from "../login-button/login-button.component";
import { UserService } from "../user.service";

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
    public data: { userService: UserService }
  ) {}

  login(): void {
    this.data.userService.login();
  }
}
