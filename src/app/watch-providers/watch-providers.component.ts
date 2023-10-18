import { AsyncPipe, CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Output,
  EventEmitter,
} from "@angular/core";
import { TMDbService } from "../tmdb.service";
import { WatchService } from "../../model/tmdb";
import { Observable, BehaviorSubject } from "rxjs";
import { UserService } from "../user.service";

@Component({
  selector: "watch-provider-select",
  templateUrl: "./watch-providers.component.html",
  styleUrls: ["./watch-providers.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, AsyncPipe],
})
export class WatchProviderSelectComponent implements OnInit {
  constructor(
    private tmdbService: TMDbService,
    private userService: UserService
  ) {}

  availableWatchProviders$: Observable<WatchService[]>;
  selectedWatchProviders$: BehaviorSubject<number[]>;

  @Output() selectionChanged = new EventEmitter();

  ngOnInit() {
    const region$ = this.userService.selectedRegion$;
    this.availableWatchProviders$ = this.tmdbService.loadMovieProviders(
      region$.getValue()
    );
    this.selectedWatchProviders$ = this.userService.selectedWatchProviders$;
  }

  toggleWatchProvider(providerId: number) {
    this.userService.toggleWatchProvider(providerId);
    this.selectionChanged.emit("Changed!");
  }
}
