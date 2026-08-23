import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
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
  data = inject<{
    userService: {
        login(): void;
    };
}>(MAT_DIALOG_DATA);


  login(): void {
    this.data.userService.login();
  }
}
