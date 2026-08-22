
import { ChangeDetectionStrategy, Component, Inject, OnInit, DOCUMENT } from "@angular/core";

import { VERSION } from "../../environments/version";

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
  version = VERSION;

  constructor(
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {}
}
