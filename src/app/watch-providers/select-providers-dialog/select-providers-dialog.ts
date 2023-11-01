import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { BehaviorSubject, Observable } from "rxjs";
import { TMDbService } from "../../tmdb.service";
import { Poll, PollItem } from "../../../model/poll";
import { WatchService, WatchlistItem } from "../../../model/tmdb";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { UserService } from "../../user.service";
import { MatButtonModule } from "@angular/material/button";
import { isEqual, sortBy } from "lodash";

@Component({
  selector: "select-providers-dialog",
  templateUrl: "select-providers-dialog.html",
  styleUrls: ["./select-providers-dialog.scss"],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    FormsModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
})
export class SelectProvidersDialog implements OnInit {
  availableWatchProviders$: Observable<WatchService[]>;
  selectedWatchProviders$: BehaviorSubject<number[]>;
  tmpSelectedWatchProviders: number[];
  isEqual = isEqual; // lodash
  sortBy = sortBy; // lodash

  constructor(
    public dialogRef: MatDialogRef<{
      pollData?: { poll: Poll; pollItems: PollItem[] };
      movieIds?: number[];
      parentStr?: string;
      watchlistItems?: WatchlistItem[];
    }>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private userService: UserService,
    @Inject(MAT_DIALOG_DATA)
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
    this.dialogRef.close();
  }

  save() {
    this.userService.setWatchProviders(this.tmpSelectedWatchProviders);
    this.closeDialog();
  }
}
