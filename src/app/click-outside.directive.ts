import { Directive, ElementRef, HostListener, Output, EventEmitter, inject } from '@angular/core';

@Directive({
    selector: '[clickOutside]',
    standalone: true
})
export class ClickOutsideDirective {
  private _elementRef = inject(ElementRef);


  @Output() clickOutside = new EventEmitter<any>();

  @HostListener('document:click', ['$event.target']) onMouseEnter(targetElement) {
    const clickedInside = this._elementRef.nativeElement.contains(targetElement);
    if (!clickedInside) {      
      this.clickOutside.emit(null);
    }
  }
}

