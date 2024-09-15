import { afterNextRender, Inject, Injectable } from '@angular/core';
import {OverlayContainer} from '@angular/cdk/overlay';
import { Observable, BehaviorSubject } from 'rxjs';
import { DOCUMENT } from '@angular/common';

@Injectable()
export class NightModeService {
  private localstorage: Storage;
  private readonly nightModelSelector = 'nightmode';
  private nightModeSubject = new BehaviorSubject<{state: boolean}>({state: false});

  night$: Observable<{ state: boolean }> = this.nightModeSubject.asObservable();

  constructor(
    private overlayContainer: OverlayContainer,
    @Inject(DOCUMENT) private document: Document
  ) {
    afterNextRender(() => {      
      this.localstorage = document.defaultView?.localStorage;
      const nightMode = this.localstorage && JSON.parse(this.localstorage?.getItem(this.nightModelSelector));
      console.log("Init nightmode service:", nightMode);
      this.set(nightMode !== undefined ? nightMode : false);
    });
  }

  set(state: boolean) {
    this.localstorage?.setItem(this.nightModelSelector, JSON.stringify(state));
    const html = this.document?.querySelector('html');
    if (state) {
      this.overlayContainer.getContainerElement().classList.add('dark-theme');
      if (html) {
        html.classList.add('dark-theme');
      }
    } else {
      this.overlayContainer.getContainerElement().classList.remove('dark-theme');
      if (html) {
        html.classList.remove('dark-theme');
      }
    }
    this.nightModeSubject.next({ state: state });
  }

}
