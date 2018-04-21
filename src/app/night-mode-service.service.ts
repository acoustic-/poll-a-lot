import { Injectable } from '@angular/core';
import {OverlayContainer} from '@angular/cdk/overlay';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class NightModeService {

  private readonly nightModelSelector = 'nightmode';
  private nightModeSubject = new BehaviorSubject<{state: boolean}>({state: false});

  night$: Observable<{ state: boolean }> = this.nightModeSubject.asObservable();

  constructor(
    private overlayContainer: OverlayContainer,
  ) {
    const nightMode = JSON.parse(localStorage.getItem(this.nightModelSelector));
    console.log("Init nightmode service:", nightMode);
    this.set(nightMode !== undefined ? nightMode : false);
  }

  set(state: boolean) {
    localStorage.setItem(this.nightModelSelector, JSON.stringify(state));
    const html = document.querySelector('html');
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
