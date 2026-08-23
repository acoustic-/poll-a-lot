
import { ChangeDetectionStrategy, Component, OnInit, DOCUMENT, inject } from "@angular/core";

import { VERSION } from "../../environments/version";
import { DatePipe } from "@angular/common";

@Component({
    selector: "footer",
    templateUrl: "./footer.component.html",
    styleUrls: ["./footer.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe]
})
export class FooterComponent implements OnInit {
  private document = inject<Document>(DOCUMENT);

  window = this.document.defaultView;
  today = Date.now();
  version = VERSION;

  ngOnInit() {}
}
