import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogActions,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButton } from "@angular/material/button";

export type ConfirmDialogColor = "primary" | "accent" | "warn";

export interface ConfirmDialogChoice<T = unknown> {
  label: string;
  value: T;
  color?: ConfirmDialogColor;
}

export interface ConfirmDialogData<T = unknown> {
  title: string;
  message?: string;
  /** Multi-choice variant: one button per choice, each closing with its `value`. */
  choices?: ConfirmDialogChoice<T>[];
  /** Plain-confirm variant (used when `choices` is absent): closes with `true`. */
  confirmLabel?: string;
  confirmColor?: ConfirmDialogColor;
  cancelLabel?: string;
}

/**
 * Generic confirm / pick-one dialog. Cancel (and, since callers open it with
 * `defaultDialogOptions.disableClose`, the only other way out) closes with
 * `undefined`, so `undefined` unambiguously means "dismissed".
 */
@Component({
  selector: "confirm-dialog",
  templateUrl: "./confirm-dialog.component.html",
  styleUrls: ["./confirm-dialog.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton],
})
export class ConfirmDialogComponent<T = unknown> {
  readonly data = inject<ConfirmDialogData<T>>(MAT_DIALOG_DATA);
  private dialogRef =
    inject<MatDialogRef<ConfirmDialogComponent<T>, T | boolean | undefined>>(MatDialogRef);

  choose(value: T | boolean): void {
    this.dialogRef.close(value);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
