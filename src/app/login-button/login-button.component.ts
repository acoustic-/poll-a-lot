import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";

@Component({
    selector: "login-button",
    templateUrl: "./login-button.component.html",
    styleUrls: ["./login-button.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LoginButtonComponent {
  @Output() loginClicked = new EventEmitter<void>();

  constructor() {}
}
