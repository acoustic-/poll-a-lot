import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";

@Component({
  selector: "spinner",
  templateUrl: "./spinner.component.html",
  styleUrls: ["./spinner.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class SpinnerComponent implements OnInit {
  @Input() size: "s" | "m" = "s";

  constructor() {}

  ngOnInit() {}
}
