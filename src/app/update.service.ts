import { Injectable } from "@angular/core";

import { MatSnackBar } from "@angular/material/snack-bar";
import { SwUpdate } from "@angular/service-worker";
import { from, timer } from "rxjs";
import { filter, switchMap } from "rxjs/operators";

@Injectable()
export class UpdateService {
  constructor(private swUpdate: SwUpdate, private snackbar: MatSnackBar) {
    // Force update on init
    setTimeout(() =>
      timer(50)
        .pipe(
          switchMap(() => from(this.swUpdate.checkForUpdate())),
          filter((update) => !!update)
        )
        .subscribe(async () => await this.update())
    );

    // Give option for following update requests
    timer(60000, 60000)
      .pipe(
        switchMap(() => from(this.swUpdate.checkForUpdate())),
        filter((update) => !!update)
      )
      .subscribe(async () => {
        const snack = this.snackbar.open("Update Available", "Reload", {
          duration: 10000,
        });
        snack.onAction().subscribe(async () => {
          await this.update();
        });
      });
  }

  async update() {
    window.location.reload();
    const snack = this.snackbar.open(
      "Poll-a-Lot was updated to latest version! ✨",
      undefined,
      { duration: 5000 }
    );
  }
}
