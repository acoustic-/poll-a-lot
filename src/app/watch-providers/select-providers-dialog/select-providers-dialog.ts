import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Inject,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { BehaviorSubject, Observable } from "rxjs";
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
        MatCheckboxModule,
        MatButtonModule,
    ]
})
export class SelectProvidersDialog implements OnInit {
  private bottomSheetRef = inject(MatBottomSheet);
  availableWatchProviders$: Observable<WatchService[]>;
  selectedWatchProviders$: BehaviorSubject<number[]>;
  tmpSelectedWatchProviders: number[];

  constructor(
    private tmdbService: TMDbService,
    private userService: UserService,
    @Inject(MAT_BOTTOM_SHEET_DATA)
    public data: {}
  ) {}

  ngOnInit() {
    const region$ = this.userService.selectedRegion$;
    this.availableWatchProviders$ = this.tmdbService.loadMovieProviders(
      region$.getValue()
    );
    this.selectedWatchProviders$ = this.userService.selectedWatchProviders$;
    this.tmpSelectedWatchProviders = this.selectedWatchProviders$.getValue();
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
