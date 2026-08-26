import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Observable, from, of } from "rxjs";
import type LocalForage from "localforage";

@Injectable()
export class LocalStorageService {
  // localforage runs storage-driver detection (IndexedDB/WebSQL/localStorage) as soon
  // as it's imported, which throws during SSR since Node has none of those. Load it
  // lazily, and only in the browser, so the server bundle never evaluates it.
  private ready: Promise<typeof LocalForage> | undefined;

  constructor() {
    const platformId = inject(PLATFORM_ID);

    if (isPlatformBrowser(platformId)) {
      this.ready = import("localforage").then((m) => m.default ?? m);
    }
  }

  public setItem<T>(key: string, value: T): Observable<T> {
    if (!this.ready) return of(value);
    return from(this.ready.then((lf) => lf.setItem(key, value)));
  }

  public getItem<T>(key: string): Observable<T | null> {
    if (!this.ready) return of(null);
    return from(this.ready.then((lf) => lf.getItem<T>(key)));
  }

  public removeItem(key: string): Observable<void> {
    if (!this.ready) return of(undefined);
    return from(this.ready.then((lf) => lf.removeItem(key)));
  }
}
