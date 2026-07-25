import { Directive, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[swiper]'
})
export class SwiperDirective {
  @Output() swipeLeft = new EventEmitter<void>();
  @Output() swipeRight = new EventEmitter<void>();

  private startX = 0;
  private threshold = 50; // lenght of swipe driggering

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    this.startX = event.clientX;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent) {
    const deltaX = event.clientX - this.startX;

    if (Math.abs(deltaX) > this.threshold) {
      if (deltaX < 0) {
        this.swipeLeft.emit();
      } else {
        this.swipeRight.emit();
      }
    }
  }
}