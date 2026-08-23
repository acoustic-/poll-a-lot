
import { ChangeDetectionStrategy, Component, OnInit, DOCUMENT, inject } from "@angular/core";

import { VERSION } from "../../environments/version";

@Component({
    selector: "footer",
    templateUrl: "./footer.component.html",
    styleUrls: ["./footer.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class FooterComponent implements OnInit {
  private document = inject<Document>(DOCUMENT);

  window = this.document.defaultView;
  today = Date.now();
  version = VERSION;

  ngOnInit() {}
}
