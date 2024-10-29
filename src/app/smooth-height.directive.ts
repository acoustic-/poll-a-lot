import {
  Directive,
  OnChanges,
  Input,
  HostBinding,
  ElementRef,
} from "@angular/core";

@Directive({
  selector: "[smoothHeight]",
  host: { "[style.display]": '"block"', "[style.overflow]": '"hidden"' },
  standalone: true,
})
export class SmoothHeightAnimDirective implements OnChanges {
  @Input() smoothHeight;
  pulse: boolean;
  startHeight: number;

  constructor(private element: ElementRef) {}

  @HostBinding("@grow")
  get grow() {
    return { value: this.pulse, params: { startHeight: 0 } };
  }

  setStartHeight() {
    this.startHeight = this.element.nativeElement.clientHeight;
  }

  ngOnChanges(changes) {
    setTimeout(() => {
        this.setStartHeight();
        this.pulse = !this.pulse;
    });
  }
}
