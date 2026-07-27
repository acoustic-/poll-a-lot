import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { LocalStorageService } from "./local-storage.service";
import { MovieSearchResultView, RecentSearchItem } from "../model/tmdb";

const STORAGE_KEY = "recent_movie_searches";
const MAX_STORED = 12;

@Injectable()
export class RecentSearchesService {
  recentSearches$ = new BehaviorSubject<RecentSearchItem[]>([]);

  constructor(private localStorage: LocalStorageService) {
    this.load();
  }

  add(movie: MovieSearchResultView): void {
    const { id, title, original_title, release_date, poster_path, vote_average } = movie;
    const withoutExisting = this.recentSearches$
      .getValue()
      .filter((item) => item.id !== id);
    const updated = [
      { id, title, original_title, release_date, poster_path, vote_average, searchedAt: Date.now() },
      ...withoutExisting,
    ].slice(0, MAX_STORED);

    this.recentSearches$.next(updated);
    this.persist(updated);
  }

  clear(): void {
    this.recentSearches$.next([]);
    this.localStorage.removeItem(STORAGE_KEY).subscribe({
      error: () => {},
    });
  }

  restore(items: RecentSearchItem[]): void {
    this.recentSearches$.next(items);
    this.persist(items);
  }

  private load(): void {
    this.localStorage.getItem<RecentSearchItem[]>(STORAGE_KEY).subscribe({
      next: (items) => this.recentSearches$.next(items ?? []),
      error: () => {},
    });
  }

  private persist(items: RecentSearchItem[]): void {
    this.localStorage.setItem(STORAGE_KEY, items).subscribe({
      error: () => {},
    });
  }
}
