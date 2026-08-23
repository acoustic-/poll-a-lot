import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Observable, map, switchMap } from "rxjs";
import { TMDbService } from "../../tmdb.service";
import { WatchService } from "../../../model/tmdb";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { UserService } from "../../user.service";
import { MatButtonModule } from "@angular/material/button";
import { isEqual } from "../../helpers";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
} from "@angular/material/bottom-sheet";

@Component({
    selector: "select-providers-dialog",
    templateUrl: "select-providers-dialog.html",
    styleUrls: ["./select-providers-dialog.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        MatDialogModule,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        MatCheckboxModule,
        MatButtonModule,
    ]
})
export class SelectProvidersDialog implements OnInit {
  private tmdbService = inject(TMDbService);
  private userService = inject(UserService);
  data = inject<{}>(MAT_BOTTOM_SHEET_DATA);

  private bottomSheetRef = inject(MatBottomSheet);
  availableWatchProviders$: Observable<WatchService[]>;
  selectedWatchProviders$: BehaviorSubject<number[]>;
  tmpSelectedWatchProviders: number[];
  filterText = '';

  ngOnInit() {
    this.availableWatchProviders$ = this.userService.selectedRegion$.pipe(
      switchMap(region => this.tmdbService.loadMovieProviders(region)),
      map(providers => [...providers].sort((a, b) => a.provider_name.localeCompare(b.provider_name)))
    );
    this.selectedWatchProviders$ = this.userService.selectedWatchProviders$;
    this.tmpSelectedWatchProviders = this.selectedWatchProviders$.getValue();
  }

  filteredProviders(providers: WatchService[] | null): WatchService[] {
    if (!providers) return [];
    if (!this.filterText) return providers;
    const q = this.filterText.toLowerCase();
    return providers.filter(p => p.provider_name.toLowerCase().includes(q));
  }

  toggleWatchProvider(providerId: number) {
    // this.userService.toggleWatchProvider(providerId);
    this.tmpSelectedWatchProviders = this.tmpSelectedWatchProviders.includes(
      providerId
    )
      ? this.tmpSelectedWatchProviders.filter((p) => p !== providerId)
      : [...this.tmpSelectedWatchProviders, providerId];
  }

  closeDialog() {
    this.bottomSheetRef.dismiss();
  }

  save() {
    this.userService.setWatchProviders(this.tmpSelectedWatchProviders);
    this.closeDialog();
  }

  watchProvidersChanged(a: number[], b: number[]): boolean {
    return isEqual([...a].sort(), [...b].sort());
  }
}
