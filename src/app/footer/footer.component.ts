import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, Inject, OnInit } from "@angular/core";

@Component({
    selector: "footer",
    templateUrl: "./footer.component.html",
    styleUrls: ["./footer.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class FooterComponent implements OnInit {
  window = this.document.defaultView;
  today = Date.now();

  constructor(
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {}
}
