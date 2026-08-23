import { Directive, EventEmitter, Input, Output, inject, OnDestroy } from "@angular/core";
import { MatAutocomplete } from "@angular/material/autocomplete";
import { Subject, of } from "rxjs";
import { takeUntil, tap } from "rxjs/operators";

export interface AutoCompleteScrollEvent {
  autoComplete: MatAutocomplete;
  scrollEvent: Event;
}

@Directive({
  selector: "mat-autocomplete[optionsScroll]",
  exportAs: "mat-autocomplete[optionsScroll]",
  standalone: true
})

//https://stackoverflow.com/questions/67903231/infinite-scroll-in-mat-autocomplete-angular-11
export class MatAutocompleteOptionsScrollDirective implements OnDestroy {
  autoComplete = inject(MatAutocomplete);

  @Input() thresholdPercent = 0.8;
  @Output("optionsScroll") scroll = new EventEmitter<AutoCompleteScrollEvent | null>();
  allowedProximityToBottom = 200; // how many pixels before the new page will be loaded
  _onDestroy = new Subject();
  // Bound once so add/removeEventListener share the exact same function reference —
  // `this.onScroll.bind(this)` creates a new (non-equal) function object every call,
  // which made the previous removeEventListener a permanent no-op.
  private boundOnScroll = this.onScroll.bind(this);
  constructor() {
    of(this.autoComplete.opened)
      .pipe(
        tap(() => {
          // Note: When autocomplete raises opened, panel is not yet created (by Overlay)
          // Note: The panel will be available on next tick
          // Note: The panel wil NOT open if there are no options to display
          setTimeout(() => {
            // Note: remove listner just for safety, in case the close event is skipped.
            this.removeScrollEventListener();
            this.autoComplete.panel?.nativeElement.addEventListener(
              "scroll",
              this.boundOnScroll
            );
          }, 5000);
        }),
        takeUntil(this._onDestroy)
      )
      .subscribe();

    of(this.autoComplete.closed)
      .pipe(
        tap(() => this.removeScrollEventListener()),
        takeUntil(this._onDestroy)
      )
      .subscribe();
  }

  private removeScrollEventListener() {
    if (this.autoComplete?.panel) {
      this.autoComplete.panel.nativeElement.removeEventListener(
        "scroll",
        this.boundOnScroll
      );
    }
  }

  ngOnDestroy() {
    this._onDestroy.next({});
    this._onDestroy.complete();

    this.removeScrollEventListener();
  }

  onScroll(event: Event) {
    if (this.thresholdPercent === undefined) {
      this.scroll.emit({ autoComplete: this.autoComplete, scrollEvent: event });
    } else {
      const scrollTop = (event.target as HTMLElement).scrollTop;
      const scrollHeight = (event.target as HTMLElement).scrollHeight;
      const elementHeight = (event.target as HTMLElement).clientHeight;
      const atBottom = scrollHeight - this.allowedProximityToBottom <= scrollTop + elementHeight;
      if (atBottom) {
        this.scroll.emit(null);
      }
    }
  }
}
