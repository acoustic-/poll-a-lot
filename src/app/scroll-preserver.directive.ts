import { Directive, ElementRef } from "@angular/core";

@Directive({
  selector: "[scrollPreserve]",
  standalone: true,
})
export class ScrollPreserverDirective {
  previousScrollHeightMinusTop: number; // the variable which stores the distance
  previousScrollPosition: number;
  readyFor: string;
  toReset = false;

  constructor(public elementRef: ElementRef) {
    this.previousScrollHeightMinusTop = 0;
    this.readyFor = "up";
    this.restore();
  }

  reset() {
    this.previousScrollHeightMinusTop = 0;
    this.readyFor = "up";
    this.elementRef.nativeElement.scrollTop =
      this.elementRef.nativeElement.scrollHeight;
  }

  restore() {
    if (this.toReset) {
      if (this.readyFor === "up") {
        // restoring the scroll position to the one stored earlier
        this.elementRef.nativeElement.scrollTop = this.previousScrollPosition;

      }
      this.toReset = false;
    }
  }

  prepareFor(direction) {
    this.toReset = true;
    this.readyFor = direction || "up";
    this.previousScrollPosition = this.elementRef.nativeElement.scrollTop;
    this.elementRef.nativeElement.scrollTop = !this.elementRef.nativeElement
      .scrollTop // check for scrollTop is zero or not
      ? this.elementRef.nativeElement.scrollTop + 1
      : this.elementRef.nativeElement.scrollTop;
    this.previousScrollHeightMinusTop =
      this.elementRef.nativeElement.scrollHeight -
      this.elementRef.nativeElement.scrollTop;
    // the current position is stored before new messages are loaded
  }

}
