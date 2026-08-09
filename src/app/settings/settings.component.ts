import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';
import { AsyncPipe, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  map,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UserService } from '../user.service';
import { NightModeService } from '../night-mode-service.service';
import { UserIdentityService, ResolvedIdentity } from '../user-identity.service';
import { TMDbService } from '../tmdb.service';
import { RecentSearchesService } from '../recent-searches.service';
import { LetterboxdService } from '../letterboxd.service';
import { MovieDialogService } from '../movie-dialog.service';
import { SelectProvidersDialog } from '../watch-providers/select-providers-dialog/select-providers-dialog';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { LoginButtonComponent } from '../login-button/login-button.component';
import { LetterboxdBadgeComponent } from '../letterboxd-badge/letterboxd-badge.component';
import { PosterComponent } from '../poster/poster.component';
import { GaugeRingComponent } from '../gauge-ring/gauge-ring.component';
import { LetterboxdMemberLink, UserPreferences } from '../../model/user';
import { FilmSummary, LetterboxdMemberCandidate, LetterboxdMemberProfileResult } from '../../model/letterboxd';
import { WatchService } from '../../model/tmdb';
import { environment } from '../../environments/environment';

type ReelPaceStateKey = 'ahead' | 'onpace' | 'behind';

// "Daily Reel Pace" lobby-card content, one per pace state. Backdrops are
// fixed curated stills bundled with the app, not the user's own Letterboxd
// data, so every user sees the same three films.
const REEL_PACE_ASSETS: Record<ReelPaceStateKey, { film: string; quote: string; backdrop: string }> = {
  ahead: {
    film: 'Top Gun (1986)',
    quote: 'I feel the need — the need for speed.',
    backdrop: 'assets/images/reel-pace/ahead-top-gun.jpg',
  },
  onpace: {
    film: 'Star Wars: A New Hope (1977)',
    quote: 'Stay on target.',
    backdrop: 'assets/images/reel-pace/on-pace-star-wars.jpg',
  },
  behind: {
    film: 'Alice in Wonderland (1951)',
    quote: "I'm late! I'm late! For a very important date!",
    backdrop: 'assets/images/reel-pace/behind-alice.jpg',
  },
};

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    AsyncPipe,
    SlicePipe,
    ReactiveFormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    UserAvatarComponent,
    LoginButtonComponent,
    LetterboxdBadgeComponent,
    PosterComponent,
    GaugeRingComponent,
  ],
})
export class SettingsComponent implements OnInit {
  readonly displayNameControl = new FormControl('', [
    Validators.required,
    Validators.minLength(1),
    Validators.maxLength(30),
  ]);

  readonly letterboxUsersControl = new FormControl('');

  readonly letterboxdMember$ = this.userService.letterboxdMember$;
  readonly letterboxdQuery = new FormControl('');
  readonly letterboxdSearching$ = new BehaviorSubject(false);
  readonly letterboxdCandidates$: Observable<LetterboxdMemberCandidate[]> =
    this.letterboxdQuery.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      tap(() => this.letterboxdSearching$.next(true)),
      switchMap((value) => {
        const query = (value ?? '').trim();
        // Autocomplete resolves on 2+ characters — anything shorter is too
        // noisy to be a useful match and not worth the API call.
        return query.length >= 2 ? this.letterboxdService.searchMembers(query) : of([]);
      }),
      tap(() => this.letterboxdSearching$.next(false)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  // Paste-a-link fallback for when Autocomplete doesn't surface the right
  // account. Plain field, not a signal — same reasoning as editingName below.
  showLetterboxdPasteField = false;
  readonly letterboxdPasteControl = new FormControl('');

  // Profile panel: favourites/stats/histogram, keyed off whichever account is
  // currently linked. undefined = not linked; otherwise the raw callable
  // result, including the opted-out-of-API case.
  readonly letterboxdProfile$: Observable<LetterboxdMemberProfileResult | undefined> =
    this.letterboxdMember$.pipe(
      switchMap((member) => member ? this.letterboxdService.getMemberProfile(member.lid) : of(undefined)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  readonly user$ = this.userService.user$;
  readonly userData$ = this.userService.userData$;
  readonly nightMode$ = this.nightModeService.night$;
  readonly selectedProviders$ = this.userService.selectedWatchProviders$;

  readonly currentUserIdentity$: Observable<ResolvedIdentity | null> =
    this.user$.pipe(
      map((u) => (u?.id ? [{ id: u.id, name: u.name }] : [])),
      switchMap((refs) =>
        refs.length ? this.identityService.resolve$(refs) : of(new Map<string, ResolvedIdentity>())
      ),
      map((m) => [...m.values()][0] ?? null),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  readonly availableProviders$: Observable<WatchService[]> =
    this.userService.selectedRegion$.pipe(
      switchMap((r) => this.tmdbService.loadMovieProviders(r))
    );

  // Plain field, not a signal/BehaviorSubject: this OnPush component already
  // re-renders after any DOM event handler within its own template fires
  // (same reasoning as UserAvatarComponent's imageFailed flag), so no
  // reactive primitive is needed for a boolean flipped from a click handler.
  editingName = false;
  private nameBeforeEdit = '';

  readonly countries = [
    { code: 'FI', name: 'Finland', flag: '🇫🇮' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
    { code: 'NO', name: 'Norway', flag: '🇳🇴' },
    { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
    { code: 'AT', name: 'Austria', flag: '🇦🇹' },
    { code: 'PL', name: 'Poland', flag: '🇵🇱' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    { code: 'IN', name: 'India', flag: '🇮🇳' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  ];

  constructor(
    private readonly userService: UserService,
    private readonly nightModeService: NightModeService,
    private readonly identityService: UserIdentityService,
    private readonly tmdbService: TMDbService,
    private readonly bottomSheet: MatBottomSheet,
    private readonly snackBar: MatSnackBar,
    private readonly recentSearchesService: RecentSearchesService,
    private readonly letterboxdService: LetterboxdService,
    private readonly movieDialog: MovieDialogService,
  ) {}

  ngOnInit(): void {
    this.user$.pipe(take(1)).subscribe((user) => {
      const initialName =
        this.userService.userData$.getValue()?.displayName ?? user?.name ?? '';
      this.displayNameControl.setValue(initialName);
    });

    const stored = this.userService.userData$.getValue()?.preferences?.letterboxFollowUsers;
    const effectiveUsers = stored && stored.length > 0 ? stored : environment.letterboxFollowUsers;
    this.letterboxUsersControl.setValue(effectiveUsers.join(', '));
  }

  login(): void {
    this.userService.openLoginDialog();
  }

  saveDisplayName(name: string | null): void {
    const trimmed = (name ?? '').trim();
    if (!trimmed || trimmed.length > 30 || this.displayNameControl.invalid) {
      return;
    }
    this.userService.setDisplayName(trimmed);
  }

  startEditingName(): void {
    this.nameBeforeEdit = this.displayNameControl.value ?? '';
    this.editingName = true;
  }

  commitName(): void {
    if (!this.editingName) {
      return;
    }
    this.editingName = false;
    // Mirrors saveDisplayName's own guard: an invalid value must revert (like
    // Escape does) rather than exit edit mode while silently failing to save,
    // which left the unsaved draft on screen with a stuck validation error.
    const trimmed = (this.displayNameControl.value ?? '').trim();
    if (!trimmed || trimmed.length > 30 || this.displayNameControl.invalid) {
      this.displayNameControl.setValue(this.nameBeforeEdit);
      return;
    }
    this.saveDisplayName(this.displayNameControl.value);
  }

  cancelEditingName(): void {
    this.displayNameControl.setValue(this.nameBeforeEdit);
    this.editingName = false;
  }

  saveLetterboxUsers(value: string | null): void {
    const users = (value ?? '')
      .split(',')
      .map(u => u.trim())
      .filter(Boolean);
    this.userService.setPreferences({ letterboxFollowUsers: users });
  }

  linkLetterboxdMember(candidate: LetterboxdMemberCandidate): void {
    // Built with conditional spreads, not `avatarUrl: candidate.avatarUrl`,
    // so a boxd.it-resolved candidate (no avatar) omits the key entirely
    // rather than setting it to undefined.
    const link: LetterboxdMemberLink = {
      lid: candidate.lid,
      username: candidate.username,
      ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
      ...(candidate.avatarUrl ? { avatarUrl: candidate.avatarUrl } : {}),
      verified: false,
      linkedAt: Date.now(),
    };
    this.userService.setPreferences({ letterboxdMember: link });
    this.letterboxdQuery.setValue('');
    this.showLetterboxdPasteField = false;
    this.letterboxdPasteControl.setValue('');
  }

  unlinkLetterboxdMember(): void {
    this.userService.setPreferences({ letterboxdMember: undefined });
  }

  togglePasteLetterboxdLink(): void {
    this.showLetterboxdPasteField = !this.showLetterboxdPasteField;
  }

  resolveLetterboxdPaste(value: string | null): void {
    const parsed = this.parseLetterboxdInput(value ?? '');
    if (!parsed) {
      this.snackBar.open(
        'Could not recognize that as a Letterboxd link or username',
        undefined,
        { duration: 3000 }
      );
      return;
    }

    if ('lid' in parsed) {
      // A boxd.it short link yields the LID directly, with no API call and
      // therefore no display name or avatar to show alongside it.
      this.linkLetterboxdMember({ lid: parsed.lid, username: parsed.lid, displayName: parsed.lid });
      return;
    }

    // A full profile link or bare username reduces to the same lookup as
    // typing in the main field — hand it off rather than duplicating the
    // search-and-confirm flow.
    this.showLetterboxdPasteField = false;
    this.letterboxdQuery.setValue(parsed.username);
  }

  setSharePhoto(share: boolean): void {
    this.userService.setSharePhoto(share);
  }

  setRegion(region: string): void {
    this.userService.setRegion(region);
  }

  openProviderDialog(): void {
    this.bottomSheet.open(SelectProvidersDialog, { data: {} });
  }

  setTheme(dark: boolean): void {
    this.nightModeService.set(dark);
  }

  setPref(key: keyof UserPreferences, value: boolean): void {
    this.userService.setPreferences({ [key]: value });
  }

  clearSearchHistory(): void {
    this.recentSearchesService.clear();
    this.snackBar.open('Search history cleared', undefined, { duration: 2000 });
  }

  deletePublicProfile(): void {
    const snack = this.snackBar.open(
      'This will remove your public profile visible to other voters.',
      'Delete',
      { duration: 5000 }
    );
    snack.onAction().subscribe(() => {
      this.userService.deletePublicProfile();
      this.snackBar.open('Public profile deleted', undefined, { duration: 2000 });
    });
  }

  logout(): void {
    this.userService.logout();
  }

  getSelectedProviders(selected: number[], available: WatchService[]): WatchService[] {
    return available.filter((p) => selected.includes(p.provider_id));
  }

  // A favourite film's own poster URL isn't a TMDB path, so the shared
  // <poster> component can't derive an image from it alone — but pulling the
  // tmdb id out of its links still gets it the usual click-through-to-TMDB
  // behavior.
  filmTmdbId(film: FilmSummary): number | undefined {
    const tmdbLink = film.links?.find((link) => link.type === 'tmdb');
    const id = tmdbLink ? Number(tmdbLink.id) : undefined;
    return id !== undefined && !Number.isNaN(id) ? id : undefined;
  }

  openFavoriteFilm(film: FilmSummary): void {
    const tmdbId = this.filmTmdbId(film);
    if (tmdbId === undefined) {
      return;
    }
    this.movieDialog.openMovie({
      isVoteable: false,
      editable: false,
      movieId: tmdbId,
      addMovie: false,
      landing: false,
      showRecentPollAdder: true,
      useNavigation: true,
    });
  }

  letterboxdWatchlistUrl(username: string): string {
    return `https://letterboxd.com/${username}/watchlist/`;
  }

  // Icon-only bar labels: repeat the filled star for each whole point, plus
  // a half-star icon for the .5 increments — no numerals.
  histogramFullStars(rating: number): unknown[] {
    return Array.from({ length: Math.floor(rating) });
  }

  histogramHasHalfStar(rating: number): boolean {
    return rating % 1 !== 0;
  }

  // 1-indexed calendar day of the year (Jan 1 = 1). Takes `date` as a
  // parameter, defaulting to now, so it's testable without mocking the clock.
  // Computed from Date.UTC on the date's own Y/M/D components rather than a
  // local-time millisecond difference — the latter is off by one for part of
  // the year in any timezone that observes DST, since local midnight-to-
  // midnight spans aren't always exactly 24h once a clock change falls
  // between them.
  dayOfYear(date: Date = new Date()): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const utcStartOfYear = Date.UTC(date.getFullYear(), 0, 1);
    return Math.round((utcDate - utcStartOfYear) / msPerDay) + 1;
  }

  // How close filmsThisYear is to a one-movie-a-day pace: pct (capped at
  // 100%, fed straight into <gauge-ring>'s [progress] input) plus how far
  // ahead (positive) or behind (negative) of that pace the count currently
  // is. Also resolves the "Daily Reel Pace" lobby-card content for the
  // current state.
  movieADayProgress(
    filmsThisYear: number,
    date: Date = new Date()
  ): {
    pct: number;
    aheadBy: number;
    dayOfYear: number;
    state: ReelPaceStateKey;
    film: string;
    quote: string;
    backdrop: string;
  } {
    const day = this.dayOfYear(date);
    const pct = day > 0 ? Math.min(1, filmsThisYear / day) : 0;
    const aheadBy = filmsThisYear - day;
    const state: ReelPaceStateKey = aheadBy > 0 ? 'ahead' : aheadBy === 0 ? 'onpace' : 'behind';
    return {
      pct,
      aheadBy,
      dayOfYear: day,
      state,
      ...REEL_PACE_ASSETS[state],
    };
  }

  yearOverYearDelta(thisYear?: number, lastYear?: number): number | undefined {
    return thisYear !== undefined && lastYear !== undefined ? thisYear - lastYear : undefined;
  }

  // The statistics endpoint documents ~18 count fields without enumerating
  // them, so this renders whatever numeric keys are actually present rather
  // than a hardcoded list that could silently omit real ones. Excludes the
  // keys already shown as hero headline stats so nothing appears twice.
  countEntries(counts: Record<string, number | undefined>): { key: string; label: string; value: number }[] {
    const shownInHero = new Set([
      'filmsInDiaryThisYear', 'filmsInDiaryLastYear',
      'films', 'filmsWatched', 'watchlist', 'filmsInWatchlist',
    ]);
    return Object.entries(counts)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && !shownInHero.has(entry[0]))
      .map(([key, value]) => ({ key, label: this.humanizeCountKey(key), value }));
  }

  // A boxd.it short link yields the LID with no API call; a full profile
  // link or bare token reduces to a username to search for, same as typing
  // directly into the main field.
  private parseLetterboxdInput(raw: string): { lid: string } | { username: string } | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const shortLink = trimmed.match(/^(?:https?:\/\/)?boxd\.it\/([A-Za-z0-9]+)\/?$/i);
    if (shortLink) {
      return { lid: shortLink[1] };
    }

    const profileLink = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?letterboxd\.com\/([A-Za-z0-9_]+)\/?$/i);
    if (profileLink) {
      return { username: profileLink[1] };
    }

    if (/^[A-Za-z0-9_]+$/.test(trimmed)) {
      return { username: trimmed };
    }

    return null;
  }

  private humanizeCountKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
}
