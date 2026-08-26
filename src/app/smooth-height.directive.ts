import { Directive, OnChanges, OnDestroy, Input, HostBinding, ElementRef, inject } from "@angular/core";

@Directive({
  selector: "[smoothHeight]",
  host: { "[style.display]": '"block"', "[style.overflow]": '"hidden"' },
  standalone: true,
})
export class SmoothHeightAnimDirective implements OnChanges, OnDestroy {
  private element = inject(ElementRef);

  @Input() smoothHeight;
  pulse: boolean;
  startHeight: number;
  private pulseTimeoutId: ReturnType<typeof setTimeout> | undefined;

  @HostBinding("@grow")
  get grow() {
    return { value: this.pulse, params: { startHeight: 0 } };
  }

  setStartHeight() {
    this.startHeight = this.element.nativeElement.clientHeight;
  }

  ngOnChanges() {
    if (this.pulseTimeoutId !== undefined) {
      clearTimeout(this.pulseTimeoutId);
    }
    this.pulseTimeoutId = setTimeout(() => {
        this.pulseTimeoutId = undefined;
        this.setStartHeight();
        this.pulse = !this.pulse;
    });
  }

  ngOnDestroy() {
    if (this.pulseTimeoutId !== undefined) {
      clearTimeout(this.pulseTimeoutId);
    }
  }
}
