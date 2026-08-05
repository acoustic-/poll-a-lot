import { TestBed } from "@angular/core/testing";
import { NEVER, of } from "rxjs";

import { LocalCacheService } from "./local-cache.service";
import { LocalStorageService } from "./local-storage.service";

class FakeLocalStorageService {
  store = new Map<string, unknown>();

  getItem<T>(key: string) {
    return of((this.store.get(key) as T) ?? null);
  }

  setItem<T>(key: string, value: T) {
    this.store.set(key, value);
    return of(value);
  }

  removeItem(key: string) {
    this.store.delete(key);
    return of(undefined);
  }
}

describe("LocalCacheService", () => {
  let service: LocalCacheService;
  let fakeStorage: FakeLocalStorageService;

  beforeEach(() => {
    jasmine.clock().install();
    // install() alone only fakes setTimeout/setInterval — Date.now()/new Date()
    // stay real unless mockDate() is also called, which is what tick() needs
    // to actually move for the TTL checks (LocalCacheService reads Date.now()
    // directly, not a timer callback).
    jasmine.clock().mockDate();
    fakeStorage = new FakeLocalStorageService();
    TestBed.configureTestingModule({
      providers: [
        LocalCacheService,
        { provide: LocalStorageService, useValue: fakeStorage },
      ],
    });
    service = TestBed.inject(LocalCacheService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  describe("requestFromCache", () => {
    it("returns null on a cache miss", () => {
      let result: unknown = "sentinel";
      service.requestFromCache("missing").subscribe((v) => (result = v));
      expect(result).toBeNull();
    });

    it("returns the record after a value has been written", () => {
      let result: unknown = null;
      service.value("k", "hello").subscribe();
      service.requestFromCache("k").subscribe((v) => (result = v));
      expect((result as { value: string }).value).toBe("hello");
    });

    it("returns null when the TTL has expired", () => {
      // expires is in seconds; write with a 10-second TTL
      service.value("k", "data", 10).subscribe();

      jasmine.clock().tick(11_000);

      let result: unknown = "sentinel";
      service.requestFromCache("k").subscribe((v) => (result = v));
      expect(result).toBeNull();
    });

    it("returns the record when still within the TTL", () => {
      service.value("k", "data", 10).subscribe();

      jasmine.clock().tick(9_000);

      let result: unknown = null;
      service.requestFromCache("k").subscribe((v) => (result = v));
      expect((result as { value: string }).value).toBe("data");
    });
  });

  describe("value", () => {
    it("emits the stored value", () => {
      let emitted: unknown = null;
      service.value("k", 42).subscribe((v) => (emitted = v));
      expect(emitted).toBe(42);
    });

    it("overwrites an existing entry", () => {
      service.value("k", "first").subscribe();
      service.value("k", "second").subscribe();

      let result: unknown = null;
      service.requestFromCache("k").subscribe((v) => (result = v));
      expect((result as { value: string }).value).toBe("second");
    });
  });

  describe("expire", () => {
    it("causes a subsequent requestFromCache to return null", () => {
      service.value("k", "data").subscribe();
      service.expire("k").subscribe();

      let result: unknown = "sentinel";
      service.requestFromCache("k").subscribe((v) => (result = v));
      expect(result).toBeNull();
    });
  });

  describe("observable", () => {
    it("calls through to the source observable on a cache miss and caches the result", () => {
      let emitted: unknown = null;

      service.observable("k", of("fetched")).subscribe((v) => (emitted = v));

      expect(emitted).toBe("fetched");

      let cached: unknown = null;
      service.requestFromCache("k").subscribe((v) => (cached = v));
      expect((cached as { value: string }).value).toBe("fetched");
    });

    it("returns the cached value without invoking the source observable when the entry is fresh", () => {
      service.value("k", "cached").subscribe();

      let emitted: unknown = null;
      // NEVER never emits, so if the service subscribes to it the test result stays null
      service.observable("k", NEVER).subscribe((v) => (emitted = v));

      expect(emitted).toBe("cached");
    });

    it("fetches fresh data after the TTL expires", () => {
      service.value("k", "stale", 10).subscribe();

      jasmine.clock().tick(11_000);

      let emitted: unknown = null;
      service
        .observable("k", of("fresh"), 10)
        .subscribe((v) => (emitted = v));

      expect(emitted).toBe("fresh");
    });
  });
});
