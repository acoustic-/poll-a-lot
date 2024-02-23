import { Injectable } from "@angular/core";

import { MatSnackBar } from "@angular/material/snack-bar";
import { SwUpdate } from "@angular/service-worker";
import { from, timer } from "rxjs";
import { filter } from "rxjs/operators";

@Injectable()
export class UpdateService {
  constructor(private swUpdate: SwUpdate, private snackbar: MatSnackBar) {
    from(this.swUpdate.checkForUpdate())
      .pipe(filter((update) => !!update))
      .subscribe(() => {
        const snack = this.snackbar.open("Update Available", "Reload");

        snack.onAction().subscribe(() => {
          window.location.reload();
        });

      });

    timer(1000 * 60 * 2).subscribe(() => swUpdate.checkForUpdate());
  }
}
