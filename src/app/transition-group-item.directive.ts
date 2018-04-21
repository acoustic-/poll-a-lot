import { Directive, ElementRef, Component, Input,ContentChildren, QueryList } from '@angular/core';

@Directive({
  selector: '[transition-group-item]'
})
export class TransitionGroupItemDirective {
  prevPos: any;

  newPos: any;

  el: HTMLElement;

  moved: boolean;

  moveCallback: any;

  constructor(elRef: ElementRef) {
    this.el = elRef.nativeElement;
  }
}


@Component({
  selector: '[transition-group]',
  template: '<ng-content></ng-content>'
})
export class TransitionGroupComponent {
  @Input('transition-group') class;

  @ContentChildren(TransitionGroupItemDirective) items: QueryList<TransitionGroupItemDirective>;

  ngAfterContentInit() {
    console.log("ng content after init", this.items)
    this.refreshPosition('prevPos');
    this.items.changes.subscribe(items => {
      items.forEach(item => {
        item.prevPos = item.newPos || item.prevPos;
      });
      console.log("items", items.length)
      items.forEach(this.runCallback);
      this.refreshPosition('newPos');
      items.forEach(this.applyTranslation);

      // force reflow to put everything in position
      const offSet = document.body.offsetHeight;
      this.items.forEach(this.runTransition.bind(this));
    })
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
    let el = item.el;
    let style: any = el.style;
    el.classList.add(cssClass);
    style.transform = style.WebkitTransform = style.transitionDuration = '';
    el.addEventListener('transitionend', item.moveCallback = (e: any) => {
      if (!e || /transform$/.test(e.propertyName)) {
        el.removeEventListener('transitionend', item.moveCallback);
        item.moveCallback = null;
        el.classList.remove(cssClass);
      }
    });
  }

  refreshPosition(prop: string) {
    this.items.forEach(item => {
      item[prop] = item.el.getBoundingClientRect();
    });
  }

  applyTranslation(item: TransitionGroupItemDirective) {
    item.moved = false;
    const dx = item.prevPos ? item.prevPos.left : 0 - item.newPos.left;
    const dy = item.prevPos ? item.prevPos.top : 0  - item.newPos.top;
    console.log(dx, dy, item);
    if (dx || dy) {
      item.moved = true;
      let style: any = item.el.style;
      style.transform = style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      style.transitionDuration = '1s';
      console.log("moved", JSON.stringify(style))
    }
  }
}