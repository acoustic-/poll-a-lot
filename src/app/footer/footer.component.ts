import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";

@Component({
  selector: "footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent implements OnInit {
  window = window;
  today = Date.now();

  constructor() {}

  ngOnInit() {}
}
