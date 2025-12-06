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
    console.log("pointer down",  event.clientX);
    this.startX = event.clientX;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent) {
    const deltaX = event.clientX - this.startX;
    console.log("pointer up",  event.clientX, deltaX);

    if (Math.abs(deltaX) > this.threshold) {
      if (deltaX < 0) {
        this.swipeLeft.emit();
      } else {
        this.swipeRight.emit();
      }
    }
  }
}