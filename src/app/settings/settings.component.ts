import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, shareReplay, switchMap, take } from 'rxjs/operators';

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

import { UserService } from '../user.service';
import { NightModeService } from '../night-mode-service.service';
import { UserIdentityService, ResolvedIdentity } from '../user-identity.service';
import { TMDbService } from '../tmdb.service';
import { RecentSearchesService } from '../recent-searches.service';
import { SelectProvidersDialog } from '../watch-providers/select-providers-dialog/select-providers-dialog';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { LoginButtonComponent } from '../login-button/login-button.component';
import { UserPreferences } from '../../model/user';
import { WatchService } from '../../model/tmdb';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    AsyncPipe,
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
    UserAvatarComponent,
    LoginButtonComponent,
  ],
})
export class SettingsComponent implements OnInit {
  readonly displayNameControl = new FormControl('', [
    Validators.required,
    Validators.minLength(1),
    Validators.maxLength(30),
  ]);

  readonly letterboxUsersControl = new FormControl('');

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
}
