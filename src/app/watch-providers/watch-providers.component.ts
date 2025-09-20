import { AsyncPipe, CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Output,
  EventEmitter,
  OnDestroy,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { TMDbService } from "../tmdb.service";
import { BehaviorSubject, Observable, combineLatest, NEVER } from "rxjs";
import { map, skip } from "rxjs/operators";
import { UserService } from "../user.service";
import { SelectProvidersDialog } from "./select-providers-dialog/select-providers-dialog";
import { WatchService } from "../../model/tmdb";
import { defaultDialogOptions } from "../common";
import { MatBottomSheet, MatBottomSheetModule } from "@angular/material/bottom-sheet";

@Component({
    selector: "watch-provider-select",
    templateUrl: "./watch-providers.component.html",
    styleUrls: ["./watch-providers.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, AsyncPipe, MatIconModule, MatBottomSheetModule]
})
export class WatchProviderSelectComponent implements OnInit, OnDestroy {
  selectedWatchProviders$: Observable<WatchService[]>;
  selectedWatchProvidersIds$: BehaviorSubject<number[]>;
  filteredWatchProviders$ = new BehaviorSubject<number[]>([]);

  subs = NEVER.subscribe();

  constructor(
    private tmdbService: TMDbService,
    private userService: UserService,
    private bottomSheet: MatBottomSheet
  ) {
    const loadedSelection =
      JSON.parse(localStorage.getItem("watch_providers")) || [];
    this.filteredWatchProviders$.next(loadedSelection);
  }

  @Output() selectionChanged = new EventEmitter<number[]>();

  ngOnInit() {
    this.selectedWatchProvidersIds$ = this.userService.selectedWatchProviders$;
    const region$ = this.userService.selectedRegion$;
    const availableWatchProviders$ = this.tmdbService.loadMovieProviders(
      region$.getValue()
    );
    this.selectedWatchProviders$ = combineLatest([
      availableWatchProviders$,
      this.selectedWatchProvidersIds$,
    ]).pipe(
      map(([available, selected]) =>
        available.filter((p) => selected.includes(p.provider_id))
      )
    );

    const filtered = JSON.parse(localStorage.getItem("watch_providers")) || [];
    this.filteredWatchProviders$.next(filtered);

    this.subs.add(
      this.selectedWatchProvidersIds$.pipe(skip(1)).subscribe((ids) => {
        this.setFilteredWatchProviders([]);
      })
    );
  }

  toggleFilteredWatchProviders(selectedWatchProvider: number) {
    let current = this.filteredWatchProviders$.getValue();
    current = current.includes(selectedWatchProvider)
      ? current.filter((p) => p !== selectedWatchProvider)
      : [...current, selectedWatchProvider];
    this.setFilteredWatchProviders(current);
  }

  private setFilteredWatchProviders(watchProviderIds: number[]) {
    this.filteredWatchProviders$.next(watchProviderIds);
    this.selectionChanged.emit(watchProviderIds);
    if (this.userService.isGoogleUser()) {
      localStorage.setItem("watch_providers", JSON.stringify(watchProviderIds));
    }
  }

  openMyProviders() {
    const bottomSheetRef = this.bottomSheet.open(SelectProvidersDialog, {
      ...defaultDialogOptions,
      data: {},
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}
