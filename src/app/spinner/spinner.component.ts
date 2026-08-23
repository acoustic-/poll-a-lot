import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

@Component({
    selector: "spinner",
    templateUrl: "./spinner.component.html",
    styleUrls: ["./spinner.component.scss"],
    imports: [CommonModule]
})
export class SpinnerComponent {
  @Input() size: "s" | "m" = "s";
}
