import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { WatchlistItem } from "../../../model/tmdb";
import { WatchlistViewMode } from "../watch-list.component";

@Component({
  selector: "watch-list-item",
  templateUrl: "./watch-list-item.component.html",
  styleUrls: ["./watch-list-item.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchListItemComponent implements OnInit {
  @Input() watchlistItem: WatchlistItem;
  @Input() viewMode: WatchlistViewMode;
  @Input() indexNumber: number;

  @Output() showMovie = new EventEmitter<number>();
  @Output() removeItem = new EventEmitter<WatchlistItem>();
  posterLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(private cd: ChangeDetectorRef) {}

  onStateChangeLoad(event) {
    if (event.reason === "finally") {
      this.posterLoaded$.next(true);
      this.cd.detectChanges();
    }
  }

  ngOnInit() {
    // console.log("nf");
  }
}
