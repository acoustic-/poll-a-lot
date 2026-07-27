import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { RecentSearchesService } from "./recent-searches.service";
import { LocalStorageService } from "./local-storage.service";
import { MovieSearchResultView, RecentSearchItem } from "../model/tmdb";

function movie(id: number, title = `Movie ${id}`): MovieSearchResultView {
  return {
    id,
    title,
    original_title: title,
    release_date: "2001-01-01",
    poster_path: "/poster.jpg",
    vote_average: 7.5,
  };
}

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

describe("RecentSearchesService", () => {
  let service: RecentSearchesService;
  let localStorage: FakeLocalStorageService;

  beforeEach(() => {
    localStorage = new FakeLocalStorageService();
    TestBed.configureTestingModule({
      providers: [
        RecentSearchesService,
        { provide: LocalStorageService, useValue: localStorage },
      ],
    });
    service = TestBed.inject(RecentSearchesService);
  });

  it("starts empty when storage has nothing", () => {
    expect(service.recentSearches$.getValue()).toEqual([]);
  });

  it("prepends a newly added movie", () => {
    service.add(movie(1));
    service.add(movie(2));

    const ids = service.recentSearches$.getValue().map((item) => item.id);
    expect(ids).toEqual([2, 1]);
  });

  it("dedupes by id and bumps the re-added movie to the front", () => {
    service.add(movie(1));
    service.add(movie(2));
    service.add(movie(1));

    const ids = service.recentSearches$.getValue().map((item) => item.id);
    expect(ids).toEqual([1, 2]);
  });

  it("caps the stored list at 12 entries", () => {
    for (let id = 1; id <= 13; id++) {
      service.add(movie(id));
    }

    const items = service.recentSearches$.getValue();
    expect(items.length).toBe(12);
    expect(items.map((item) => item.id)).not.toContain(1);
    expect(items[0].id).toBe(13);
  });

  it("persists adds through to storage", () => {
    service.add(movie(1));
    expect(localStorage.store.get("recent_movie_searches")).toEqual(
      service.recentSearches$.getValue()
    );
  });

  it("clear empties the list and removes it from storage", () => {
    service.add(movie(1));
    service.clear();

    expect(service.recentSearches$.getValue()).toEqual([]);
    expect(localStorage.store.has("recent_movie_searches")).toBeFalse();
  });

  it("restore puts a previously cleared snapshot back and persists it", () => {
    const snapshot: RecentSearchItem[] = [{ ...movie(1), searchedAt: 123 }];
    service.add(movie(2));
    service.clear();

    service.restore(snapshot);

    expect(service.recentSearches$.getValue()).toEqual(snapshot);
    expect(localStorage.store.get("recent_movie_searches")).toEqual(snapshot);
  });

  it("does not throw when storage read fails", () => {
    const failingLocalStorage = new FakeLocalStorageService();
    spyOn(failingLocalStorage, "getItem").and.returnValue(
      throwError(() => new Error("boom"))
    );

    expect(
      () => new RecentSearchesService(failingLocalStorage as unknown as LocalStorageService)
    ).not.toThrow();
  });
});
