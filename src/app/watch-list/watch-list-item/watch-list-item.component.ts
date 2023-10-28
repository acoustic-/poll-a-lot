import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
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
export class WatchListItemComponent {
  @Input() set watchlistItem(watchlistItem: WatchlistItem) {
    this.watchlistItem$.next(watchlistItem);
  }
  @Input() viewMode: WatchlistViewMode;
  @Input() indexNumber: number;

  @Output() showMovie = new EventEmitter<number>();
  @Output() removeItem = new EventEmitter<WatchlistItem>();

  watchlistItem$ = new BehaviorSubject<WatchlistItem | undefined>(undefined);

  constructor() {}
}
