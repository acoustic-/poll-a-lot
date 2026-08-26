import { Directive, ElementRef, Component, Input, ContentChildren, QueryList, OnDestroy, inject, AfterContentInit } from '@angular/core';
import { NEVER } from 'rxjs';

@Directive({ selector: '[transitionGroupItem]' })
export class TransitionGroupItemDirective {
  prevPos: DOMRect;

  newPos: DOMRect;

  el: HTMLElement;

  moved: boolean;

  // Called by the browser as a "transitionend" listener (with an event) and
  // also invoked directly with no argument (runCallback, below) — the `!e`
  // guard inside runTransition's assignment handles both.
  moveCallback: ((e?: TransitionEvent) => void) | null;

  constructor() {
    const elRef = inject(ElementRef);

    this.el = elRef.nativeElement;
  }
}



@Component({
    selector: 'transition-group',
    template: '<ng-content></ng-content>'
})
export class TransitionGroupComponent implements OnDestroy, AfterContentInit {
  @Input('transition-group') class;

  @ContentChildren(TransitionGroupItemDirective) items: QueryList<TransitionGroupItemDirective>;

  subs = NEVER.subscribe();

  ngAfterContentInit() {
    this.refreshPosition('prevPos');
    this.subs.add(
      this.items.changes.subscribe(items => {
        items.forEach(item => {
          item.prevPos = item.newPos || item.prevPos;
        });
        items.forEach(this.runCallback);
        this.refreshPosition('newPos');
        items.forEach(this.applyTranslation);

        // force reflow to put everything in position
        void document.body.offsetHeight;
        this.items.forEach(this.runTransition.bind(this));
      })
    );
  }

  runCallback(item: TransitionGroupItemDirective) {
    if(item.moveCallback) {
      item.moveCallback();
    }
  }

  runTransition(item: TransitionGroupItemDirective) {
    if (!item.moved) {
      return;
    }
    const cssClass = this.class + '-move';
    const el = item.el;
    const style = el.style;
    el.classList.add(cssClass);
    style.transform = style.transitionDuration = '';
    el.addEventListener('transitionend', item.moveCallback = (e: TransitionEvent) => {
      if (!e || /transform$/.test(e.propertyName)) {
        el.removeEventListener('transitionend', item.moveCallback);
        item.moveCallback = null;
        el.classList.remove(cssClass);
      }
    });
  }

  refreshPosition(prop: 'prevPos' | 'newPos') {
    this.items.forEach(item => {
      item[prop] = item.el.getBoundingClientRect();
    });
  }

  applyTranslation(item: TransitionGroupItemDirective) {
    item.moved = false;
    const dx = item.prevPos ? item.prevPos.left : 0 - item.newPos.left;
    const dy = item.prevPos ? item.prevPos.top : 0  - item.newPos.top;
    if (dx || dy) {
      item.moved = true;
      const style = item.el.style;
      style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      style.transitionDuration = '1s';
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}