import {
  afterNextRender,
  Injectable,
  OnChanges,
} from "@angular/core";

import { MatSnackBar } from "@angular/material/snack-bar";
import { SwUpdate } from "@angular/service-worker";
import { from, NEVER, timer } from "rxjs";
import { filter, switchMap } from "rxjs/operators";
import packageJson from "../../package.json";

@Injectable()
export class UpdateService implements OnChanges {
  public version: string = packageJson.version;

  private subs = NEVER.subscribe();

  constructor(private swUpdate: SwUpdate, private snackbar: MatSnackBar) {
    // Force update on init
    afterNextRender(() => {
      setTimeout(() =>
        this.subs.add(
          timer(50)
            .pipe(
              switchMap(() => from(this.swUpdate.checkForUpdate())),
              filter((update) => !!update)
            )
            .subscribe(async () => await this.update())
        )
      );

      // Give option for following update requests
      this.subs.add(
        timer(60000, 60000)
          .pipe(
            switchMap(() => from(this.swUpdate.checkForUpdate())),
            filter((update) => !!update)
          )
          .subscribe(async () => {
            const snack = this.snackbar.open(
              `Update Available (v${this.version})`,
              "Reload",
              {
                duration: 10000,
              }
            );
            snack.onAction().subscribe(async () => {
              await this.update();
            });
          })
      );
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

  ngOnChanges(): void {}
}
