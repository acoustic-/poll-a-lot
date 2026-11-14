import { afterNextRender, Injectable, Injector, runInInjectionContext, inject, OnDestroy } from "@angular/core";
import { Observable, BehaviorSubject, Subject, NEVER, firstValueFrom, TimeoutError } from "rxjs";
import { User, UserData, UserPreferences, PublicProfile, LetterboxdMemberLink } from "../model/user";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LoginDialogComponent } from "./login-dialog/login-dialog.component";
import { WelcomeDialogComponent } from "./welcome-dialog/welcome-dialog.component";
import {
  map,
  filter,
  take,
  tap,
  first,
  switchMap,
  takeUntil,
  distinctUntilChanged,
  timeout,
} from "rxjs/operators";
import { WatchlistItem } from "../model/tmdb";
import { Poll } from "../model/poll";
import {
  DocumentReference,
  Firestore,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  docData,
  getDoc,
  setDoc,
  updateDoc,
} from "@angular/fire/firestore";
import {
  Auth,
  GoogleAuthProvider,
  User as FirebaseUser,
  linkWithPopup,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  updateProfile,
} from "@angular/fire/auth";
import { defaultDialogOptions } from "./common";
import { UserIdentityService } from "./user-identity.service";
import { isGoogleAccount, isMe } from "./user-identity";
import { ConfirmDialogComponent, ConfirmDialogData } from "./confirm-dialog/confirm-dialog.component";
import { environment } from "../environments/environment";

/** What a nickname user's browser keeps in localStorage ("user"). The pre-2.0
 *  shape was `{ name, localUserId }`; `localUserId` is read as a legacy id. */
interface StoredUser {
  name?: string;
  /** The anonymous account made for this nickname. Doubles as the marker that
   *  stops a second tab from making another one while the first is still syncing. */
  anonUid?: string;
  localUserId?: string;
  legacyLocalUserIds?: string[];
  previousUids?: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function legacyIdsOf(stored: StoredUser | undefined): string[] | undefined {
  const ids = unique([...(stored?.legacyLocalUserIds ?? []), ...(stored?.localUserId ? [stored.localUserId] : [])]);
  return ids.length ? ids : undefined;
}

@Injectable()
export class UserService implements OnDestroy {
  dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private injector = inject(Injector);
  private userIdentityService = inject(UserIdentityService);

  private userCollection;
  private currentUserDataDoc: DocumentReference<UserData> | undefined;

  private localStorage: Storage | undefined;

  user$ = new BehaviorSubject<User | undefined>(undefined);
  afterLogin$ = new Subject<void>();
  userData$ = new BehaviorSubject<UserData | undefined>(undefined);

  selectedWatchProviders$ = new BehaviorSubject<number[]>([]);
  selectedRegion$ = new BehaviorSubject<string>("FI");
  recentPolls$ = new BehaviorSubject<{ id: string; name: string }[]>([]);
  favoritePolls$ = new BehaviorSubject<{ id: string; name: string }[]>([]);

  // onAuthStateChanged (below) resolves asynchronously — with SSR/hydration,
  // AppComponent's afterNextRender can fire before that first callback does,
  // so user$'s initial `undefined` doesn't yet mean "logged out". This flips
  // true once the real auth state is known, so openWelcomeDialogIfFirstVisit
  // can wait for it instead of racing it.
  private authResolved$ = new BehaviorSubject<boolean>(false);

  // `uid|isAnonymous` of the auth user last handled. onIdTokenChanged also fires
  // on every hourly token refresh, which must not re-emit user$ (that restarts
  // the users/{uid} stream and every combineLatest hanging off user$).
  private lastAuthKey: string | undefined;
  private upgradeRetryScheduled = false;

  defaultWatchProviders = [337, 8, 119, 384, 323, 463];

  readonly letterboxFollowUsers$: Observable<string[]> = this.userData$.pipe(
    map(userData => {
      const stored = userData?.preferences?.letterboxFollowUsers;
      return stored && stored.length > 0 ? stored : environment.letterboxFollowUsers;
    }),
    distinctUntilChanged((a, b) => a.length === b.length && a.every((u, i) => u === b[i]))
  );

  readonly letterboxdMember$: Observable<LetterboxdMemberLink | undefined> = this.userData$.pipe(
    map(userData => userData?.preferences?.letterboxdMember),
    distinctUntilChanged((a, b) => a?.lid === b?.lid && a?.verified === b?.verified)
  );

  subs = NEVER.subscribe();

  constructor() {
    afterNextRender(() => {
      this.localStorage = localStorage;
    });

      // setLogLevel(LogLevel.SILENT);

      this.userCollection = collection(this.firestore, "users");

      this.subs.add(
        // onIdTokenChanged rather than onAuthStateChanged: linking a nickname
        // account to Google keeps the uid and so never fires the latter.
        onIdTokenChanged(this.auth, (authUser) => this.handleAuthUser(authUser))
      );

      this.subs.add(
        this.user$
          .asObservable()
          .pipe(
            // Only a Google account has users/{uid} and a public profile.
            filter((user): user is User & { id: string } => isGoogleAccount(user)),
            // Folding remembered ids into user$ (below) re-emits it; that must not
            // restart this stream, so only a real change of who/what we show does.
            distinctUntilChanged(
              (a, b) => a.id === b.id && a.name === b.name && a.photoURL === b.photoURL
            ),
            // docData() needs an active Angular injection context (an
            // AngularFire dev-mode warning otherwise) but this switchMap
            // callback runs later, well after the constructor's own
            // context has closed.
            //
            // Deliberately folds the publicProfiles upsert into *this* stream
            // rather than a separate combineLatest([user$, userData$]): userData$
            // is a BehaviorSubject seeded with `undefined`, so a combineLatest
            // fires the moment user$ resolves — before this docData() has ever
            // actually read the user's saved displayName/shareProfilePhoto —
            // and would publish the wrong (default) values for a split second
            // to a world-readable collection. Waiting for this switchMap's own
            // first real emission guarantees upsertPublicProfile only ever sees
            // this user's actual settings, never the BehaviorSubject's stand-in.
            switchMap((user) =>
              (runInInjectionContext(this.injector, () =>
                docData(doc(this.firestore, `users/${user.id}`))
              ) as Observable<UserData>).pipe(map((userData) => ({ user, userData })))
            )
          )
          .subscribe(({ user, userData }) => {
            this.userData$.next(userData);
            this.adoptRememberedIds(userData);
            this.upsertPublicProfile(user, userData).catch((err) =>
              console.error("Failed to publish public profile:", err)
            );
          })
      );

      this.init();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  init() {
    this.loadRegion();
    this.loadWatchProviders();
    this.loadRecentPolls();
    this.loadFavoritePolls();
  }


  openLoginDialog(requireStrongAuth = false): void {
    const dialogRef = this.dialog.open(LoginDialogComponent, {
      ...defaultDialogOptions,
      data: { username: "", userService: this, requireStrongAuth },
    });

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((result) => {
        if (result && result.length > 0) {
          this.signInWithNickname(result);
        }
      });

    this.user$
      .pipe(
        filter(
          (user) =>
            user !== undefined &&
            (requireStrongAuth === true ? isGoogleAccount(user) : true)
        ),
        takeUntil(dialogRef.afterClosed())
      )
      .subscribe((user) => {
        dialogRef.close();
        if (user) {
          this.snackBar.open("Logged in!", undefined, { duration: 3000 });
        } else {
          this.snackBar.open("Logging in failed!", undefined, {
            duration: 3000,
          });
        }
      });
  }

  hasSeenWelcome(): boolean {
    return this.localStorage?.getItem("welcome_seen") === "true";
  }

  markWelcomeSeen(): void {
    this.localStorage?.setItem("welcome_seen", "true");
  }

  // Opened once from AppComponent at bootstrap. Waits for authResolved$
  // rather than deciding immediately: with SSR/hydration, afterNextRender
  // can fire before onAuthStateChanged's first callback does, and deciding
  // off user$'s placeholder `undefined` would show the dialog to an
  // already-logged-in user for a flash before it auto-closes.
  openWelcomeDialogIfFirstVisit(): void {
    this.authResolved$
      .pipe(
        filter(Boolean),
        take(1)
      )
      .subscribe(() => this.maybeOpenWelcomeDialog());
  }

  async login(): Promise<void> {
    const current = this.auth.currentUser;
    if (!current?.isAnonymous) {
      signInWithPopup(this.auth, new GoogleAuthProvider());
      return;
    }

    // A nickname user signing in: link the Google account onto the same uid, so
    // everything they made stays theirs and nothing has to move.
    try {
      await linkWithPopup(current, new GoogleAuthProvider());
      await this.refreshLinkedUser(current);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/credential-already-in-use") {
        await this.switchToExistingGoogleAccount(current, error);
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error("Failed to sign in with Google:", error);
        this.snackBar.open("Signing in failed.", undefined, { duration: 3000 });
      }
    }
  }

  logout() {
    const isNickname = this.getUser()?.isAnonymous === true;
    const snack = this.snackBar.open(
      isNickname
        ? "Are you sure? A nickname account can't be recovered unless you sign in with Google first."
        : "Are you sure?",
      "Log out",
      { duration: isNickname ? 8000 : 3000 }
    );
    snack.onAction().subscribe(() => {
      this.auth.signOut();
      this.localStorage?.removeItem("user");
      this.localStorage?.removeItem("watch_providers");
      this.localStorage?.removeItem("recent_polls");

      this.selectedRegion$.next("FI");
      this.selectedWatchProviders$.next(this.defaultWatchProviders);
      this.recentPolls$.next([]);
      this.favoritePolls$.next([]);

      this.user$.next(undefined);
      this.snackBar.open("Logged out!", undefined, { duration: 2000 });
    });
  }

  /** Is `ref` (a voter, reaction user, ...) the signed-in person? Delegates to
   *  `isMe`, so an earlier identity the browser remembers counts, and a name never
   *  does. The two-argument form compares `a` against the viewer `b`. */
  usersAreEqual(a: User | undefined, b: User | undefined): boolean {
    if (a === undefined || b === undefined) {
      return false;
    }
    return isMe(a, b) || isMe(b, a);
  }

  getUser(): User | undefined {
    return this.user$.getValue();
  }

  isCurrentUser(user: User): boolean {
    return isMe(user, this.getUser());
  }

  isLoggedIn(): boolean {
    return this.user$.getValue() !== undefined;
  }

  isGoogleUser(): boolean {
    return isGoogleAccount(this.user$.getValue());
  }

  getUserOrOpenLogin(
    cp?: () => void,
    requireStrongAuth = false
  ): User | undefined {
    const user = this.getUser();
    // A write needs a Firebase user (`id`). A nickname user whose anonymous
    // sign-in is still in flight has a name but no `id` yet: wait for it rather
    // than asking them to log in again.
    if (user && (requireStrongAuth === true ? isGoogleAccount(user) : !!user.id)) {
      return user;
    } else if (user && !user.id && !requireStrongAuth) {
      this.waitForSignIn(cp);
      return undefined;
    } else {
      this.openLoginDialog(requireStrongAuth);
      this.user$
        .pipe(
          filter(
            (user) =>
              user !== undefined &&
              (requireStrongAuth === true ? isGoogleAccount(user) : !!user.id)
          ),
          first(),
          tap(() => {
            if (cp) {
              cp();
            }
          })
        )
        .subscribe();
      return undefined;
    }
  }

  // Settings-page write path (Phase 7 UI calls these); both land in userData$ via
  // the users/{id} docData() subscription, which re-triggers upsertPublicProfile
  // automatically — no need to touch publicProfiles directly from here.
  async setDisplayName(displayName: string): Promise<void> {
    const trimmed = displayName.trim().slice(0, 30);
    if (!trimmed || !this.currentUserDataDoc) {
      return;
    }
    await updateDoc(this.currentUserDataDoc, { displayName: trimmed });
  }

  async setSharePhoto(share: boolean): Promise<void> {
    if (!this.currentUserDataDoc) {
      return;
    }
    await updateDoc(this.currentUserDataDoc, { shareProfilePhoto: share });
  }

  async setPreferences(prefs: Partial<UserPreferences>): Promise<void> {
    const current = this.userData$.getValue()?.preferences ?? {};
    const merged: UserPreferences = { ...current, ...prefs };

    // A caller clearing an optional preference (e.g. unlinking a Letterboxd
    // account) passes `undefined` for that key, and a preference that's an
    // object (letterboxdMember) can carry an undefined-valued field nested
    // inside it too (e.g. a paste-a-link-resolved account with no avatar).
    // Firestore's updateDoc() rejects undefined field values at any depth, so
    // strip them here — a JSON round-trip drops undefined-valued keys
    // recursively, unlike a shallow Object.entries filter.
    const firestoreSafe = JSON.parse(JSON.stringify(merged)) as UserPreferences;

    if (this.currentUserDataDoc) {
      try {
        await updateDoc(this.currentUserDataDoc, { preferences: firestoreSafe });
      } catch (err) {
        console.error('Failed to save preferences:', err);
      }
    } else {
      this.localStorage?.setItem('user_preferences', JSON.stringify(firestoreSafe));
    }

    // Mirror to the individual localStorage keys that poll.component.ts reads
    // directly, so a preference set here takes effect on the poll page immediately.
    if (merged.condensedMovieView !== undefined) {
      this.localStorage?.setItem('condensed_poll_view', JSON.stringify(merged.condensedMovieView));
    }
    if (merged.hideWatchedMovies !== undefined) {
      this.localStorage?.setItem('hide_watched_movied_poll_view', JSON.stringify(merged.hideWatchedMovies));
    }
    if (merged.useBackdropTheme !== undefined) {
      this.localStorage?.setItem('backdrop_theme', JSON.stringify(merged.useBackdropTheme));
    }

    const existing = this.userData$.getValue();
    if (existing != null) {
      this.userData$.next({ ...existing, preferences: merged });
    }
  }

  getPreferences(): UserPreferences {
    return (
      this.userData$.getValue()?.preferences ??
      JSON.parse(this.localStorage?.getItem('user_preferences') ?? 'null') ??
      {}
    );
  }

  // Past votes fall back to their frozen UserRef snapshot once this is gone —
  // see toUserRef (user-identity.ts) and UserIdentityService.
  async deletePublicProfile(): Promise<void> {
    const user = this.getUser();
    if (!isGoogleAccount(user) || !user?.id) {
      return;
    }
    await deleteDoc(doc(this.firestore, `publicProfiles/${user.id}`));
  }

  // Region and watch providers relate to user
  setRegion(region: string) {
    if (region) {
      this.localStorage?.setItem("region", region);
      this.selectedRegion$.next(region);

      if (this.currentUserDataDoc) {
        updateDoc(this.currentUserDataDoc, { region });
      }
    }
  }

  async loadRegion() {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);

      if (userDataSnap.exists()) {
        const region = userDataSnap.data()?.region || "FI";
        this.selectedRegion$.next(region || "FI");
        return;
      }
    }
    const region = this.localStorage?.getItem("region");
    this.selectedRegion$.next(region || "FI");
  }

  toggleWatchProvider(watchProviderId: number) {
    const selectedWatchProviders = this.selectedWatchProviders$.getValue();
    const updated = selectedWatchProviders.some(
      (provider) => provider === watchProviderId
    )
      ? selectedWatchProviders.filter(
          (provider) => provider !== watchProviderId
        )
      : [...selectedWatchProviders, watchProviderId];

    this.selectedWatchProviders$.next(updated);

    if (this.currentUserDataDoc) {
      updateDoc(this.currentUserDataDoc, { watchproviders: updated });
    }
  }

  setWatchProviders(watchProvidersIds: number[]) {
    this.selectedWatchProviders$.next(watchProvidersIds);

    if (this.currentUserDataDoc) {
      updateDoc(this.currentUserDataDoc, {
        watchproviders: watchProvidersIds,
      });
    } else {
      this.localStorage?.setItem(
        "watch_providers",
        JSON.stringify(watchProvidersIds)
      );
    }
  }

  async loadWatchProviders() {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);

      if (userDataSnap.exists()) {
        const watchProviders =
          userDataSnap.data()?.watchproviders ||
          this.defaultWatchProviders;
        this.selectedWatchProviders$.next(watchProviders);
        return;
      }
    }
    const watchProvidersStr =
      this.localStorage?.getItem("watch_providers") || "[]";
    const watchProviders =
      JSON.parse(watchProvidersStr) || this.defaultWatchProviders;
    this.selectedWatchProviders$.next(watchProviders);
  }

  async loadRecentPolls() {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);

      if (userDataSnap.exists()) {
        const recentPolls = userDataSnap.data()?.latestPolls || [];
        this.recentPolls$.next(recentPolls);
        return;
      }
    }
    const recentPollsStr = this.localStorage?.getItem("recent_polls");
    const recentPolls = JSON.parse(recentPollsStr || "[]");
    this.recentPolls$.next(recentPolls);
  }

  async loadFavoritePolls() {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);

      if (userDataSnap.exists()) {
        const favoritePolls = userDataSnap.data()?.favoritePolls || [];
        this.favoritePolls$.next(favoritePolls);
        return;
      }
    }
    const favoritePollsStr = this.localStorage?.getItem("favorite_polls");
    const favoritePolls = JSON.parse(favoritePollsStr || "[]");
    this.favoritePolls$.next(favoritePolls);
  }

  getWatchlistMovies$(): Observable<WatchlistItem[]> {
    return this.getUserData$().pipe(
      filter((d) => !!d),
      map((data) => data.watchlist)
    );
  }

  toggleWatchlistMovie(
    watchlistItem: WatchlistItem,
    watchlist: WatchlistItem[],
    allowToggle = true // If true, the duplicate movie will be toggled, otherwise give warning
  ): Promise<void> {
    if (this.currentUserDataDoc) {
      const removeMovie = watchlist.some(
        (watchlistMovie) =>
          watchlistMovie.moviePollItemData.id ===
          watchlistItem.moviePollItemData.id
      );

      if (removeMovie && allowToggle === false) {
        return Promise.resolve();
      }

      const updated = removeMovie
        ? watchlist.filter(
            (watchlistMovie) =>
              watchlistMovie.moviePollItemData.id !==
              watchlistItem.moviePollItemData.id
          )
        : [...watchlist, watchlistItem];
      return updateDoc(this.currentUserDataDoc, { watchlist: updated });
    }
    return Promise.resolve();
  }

  async setRecentPoll(poll: Poll) {
    const maxLatestPolls = 20;
    if (!poll) {
      return;
    }
    const add = { id: poll.id, name: poll.name };

    if (this.currentUserDataDoc) {
      // Same injection-context requirement as docData() above — setRecentPoll
      // is called from a poll-load callback, not synchronously from a
      // constructor.
      const userData = await firstValueFrom(
        runInInjectionContext(this.injector, () =>
          docData(this.currentUserDataDoc)
        )
      ) as UserData;
      const latestPolls = [
        add,
        ...(userData?.latestPolls || []).filter((p) => p.id !== poll.id),
      ].slice(0, maxLatestPolls);
      updateDoc(this.currentUserDataDoc, { latestPolls });
      this.recentPolls$.next(latestPolls as { id: string; name: string }[]);
    } else if (this.getUser() !== undefined) {
      this.recentPolls$
        .pipe(
          take(1),
          map((recentPolls) => [add, ...recentPolls])
        )
        .subscribe((recentPolls) => {
          this.localStorage?.setItem(
            "recent_polls",
            JSON.stringify(recentPolls)
          );
          this.recentPolls$.next(recentPolls);
        });
    }
  }

  async removeRecentPoll(id: Poll['id']) {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);
      const userData = userDataSnap.data() as UserData;
      const latestPolls = [
        ...(userData?.latestPolls || []).filter((p) => p.id !== id),
      ];
      updateDoc(this.currentUserDataDoc, { latestPolls });
      this.recentPolls$.next(latestPolls);
    } else if (this.getUser() !== undefined) {
      this.recentPolls$
        .pipe(
          take(1),
          map((recentPolls) => [...recentPolls])
        )
        .subscribe((recentPolls) => {
          this.localStorage?.setItem(
            "recent_polls",
            JSON.stringify(recentPolls.filter((p) => p.id !== id))
          );
          this.recentPolls$.next(recentPolls.filter((p) => p.id !== id));
        });
    }
  }

  async toggleFavoritePoll(poll: Poll) {
    if (!poll) {
      return;
    }
    const add = { id: poll.id, name: poll.name };

    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);
      const userData = userDataSnap.data() as UserData;

      let favoritePolls = (userData?.favoritePolls || []);
      if (favoritePolls.some(favorite => favorite.id === add.id)) {
        // Remove favorite
        favoritePolls = favoritePolls.filter((p) => p.id !== poll.id);
        this.snackBar.open(`You removed ${poll.name} from favourites.`, undefined, { duration: 3000 });
      } else {
        // Add favorite
        this.snackBar.open(`You added ${poll.name} to favourites.`, undefined, { duration: 3000 });
        favoritePolls = [...favoritePolls, add];
      }

      updateDoc(this.currentUserDataDoc, { favoritePolls });
      this.favoritePolls$.next(favoritePolls);
    } else if (this.getUser() !== undefined) {
      this.favoritePolls$
        .pipe(
          take(1),
          map((favoritePolls) => {
            const foundFavorite = favoritePolls.find(favorite => favorite.id === add.id);
            if (foundFavorite) {
              // Remove favorite
              favoritePolls = favoritePolls.filter((p) => p.id !== poll.id)
            } else {
              // Add favorite
              favoritePolls = [...favoritePolls, add];
            }
            return favoritePolls;
          })
        )
        .subscribe((favoritePolls) => {
          this.localStorage?.setItem(
            "favorite_polls",
            JSON.stringify(favoritePolls)
          );
          this.favoritePolls$.next(favoritePolls);
        });
    }
  }

  async removeFavoritePoll(id: Poll['id']) {
    if (this.currentUserDataDoc) {
      const userDataSnap = await getDoc(this.currentUserDataDoc);
      const userData = userDataSnap.data() as UserData;

      let favoritePolls = (userData?.favoritePolls || []);
      if (favoritePolls.some(favorite => favorite.id === id)) {
        // Remove favorite
        favoritePolls = favoritePolls.filter((p) => p.id !== id);
      }

      updateDoc(this.currentUserDataDoc, { favoritePolls });
      this.favoritePolls$.next(favoritePolls);
    } else if (this.getUser() !== undefined) {
      this.favoritePolls$
        .pipe(
          take(1),
          map((favoritePolls) => {
            const foundFavorite = favoritePolls.find(favorite => favorite.id === id);
            if (foundFavorite && favoritePolls.includes(foundFavorite)) {
                // Remove favorite
                favoritePolls = favoritePolls.filter((p) => p.id !== id)
              }
              return favoritePolls;
          })
        )
        .subscribe((favoritePolls) => {
          this.localStorage?.setItem(
            "favorite_polls",
            JSON.stringify(favoritePolls)
          );
          this.favoritePolls$.next(favoritePolls as { id: string; name: string }[]);
        });
    }
  }

  getUserData$(): Observable<UserData | undefined> {
    return this.userData$;
  }

  // Only ever called once auth state is actually known — see authResolved$.
  // Backdrop click / Escape are not disabled here (unlike openLoginDialog's
  // dialog, which requires a real choice) — leaving this dialog unresolved
  // would just mean showing it again next visit for no reason, so any close
  // counts as "seen".
  private maybeOpenWelcomeDialog(): void {
    if (this.hasSeenWelcome() || this.isGoogleUser()) {
      return;
    }

    const dialogRef = this.dialog.open(WelcomeDialogComponent, {
      ...defaultDialogOptions,
      disableClose: false,
      data: { userService: this },
    });

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe(() => this.markWelcomeSeen());

    this.user$
      .pipe(
        filter((user) => isGoogleAccount(user)),
        take(1),
        takeUntil(dialogRef.afterClosed())
      )
      .subscribe(() => dialogRef.close());
  }

  private handleAuthUser(authUser: FirebaseUser | null): void {
    const key = authUser ? `${authUser.uid}|${authUser.isAnonymous}` : "none";
    if (key === this.lastAuthKey) {
      return;
    }
    this.lastAuthKey = key;
    const stored = this.readStoredUser();

    if (!authUser) {
      this.currentUserDataDoc = undefined;
      if (stored?.name) {
        // A nickname user from before 2.0, or whose anonymous account is gone.
        // Shown by name straight away; they can't write until the sign-in below
        // gives them an `id` (see getUserOrOpenLogin).
        this.user$.next({
          name: stored.name,
          localUserId: stored.localUserId,
          legacyLocalUserIds: legacyIdsOf(stored),
          previousUids: stored.previousUids,
        });
        this.upgradeStoredUser(stored);
      } else {
        this.user$.next(undefined);
      }
    } else if (authUser.isAnonymous) {
      this.currentUserDataDoc = undefined;
      const name = stored?.name ?? authUser.displayName ?? undefined;
      this.writeStoredUser({ ...stored, name, anonUid: authUser.uid });
      this.user$.next({
        id: authUser.uid,
        isAnonymous: true,
        name,
        legacyLocalUserIds: legacyIdsOf(stored),
        previousUids: stored?.previousUids,
      });
    } else {
      // After linking, the account's own displayName/photoURL still hold the
      // nickname; the Google provider entry has the real ones.
      const google = authUser.providerData.find((p) => p.providerId === "google.com");
      const displayName = google?.displayName ?? authUser.displayName;
      const name = displayName?.split(" ")[0].length ? displayName.split(" ")[0] : displayName ?? undefined;
      const user: User = {
        id: authUser.uid,
        name,
        photoURL: (google?.photoURL ?? authUser.photoURL) ?? undefined,
        legacyLocalUserIds: legacyIdsOf(stored),
        previousUids: stored?.previousUids,
      };
      this.user$.next(user);

      this.currentUserDataDoc = doc(this.userCollection, authUser.uid) as DocumentReference<UserData>;
      this.setupUserData(authUser.uid)
        .then(() => this.rememberIds(authUser.uid, user))
        .catch((err) => console.error("Failed to set up user data:", err));
      // A signed-in Google user never needs the first-visit welcome
      // dialog, even if they never actually saw or dismissed it
      // themselves (e.g. it shipped after they'd already signed in).
      this.markWelcomeSeen();
    }

    this.authResolved$.next(true);
    this.init();
  }

  // A nickname user whose browser has a stored name but no Firebase user: from
  // before 2.0, or one whose anonymous account was lost (site data partly cleared).
  private upgradeStoredUser(stored: StoredUser): void {
    if (typeof window === "undefined" || !stored.name) {
      return;
    }
    this.ensureAnonymousSession(stored.name).catch((error) => {
      console.error("Failed to sign the nickname user in:", error);
      this.retryUpgradeWhenOnline();
    });
  }

  private retryUpgradeWhenOnline(): void {
    if (this.upgradeRetryScheduled) {
      return;
    }
    this.upgradeRetryScheduled = true;
    window.addEventListener(
      "online",
      () => {
        this.upgradeRetryScheduled = false;
        const stored = this.readStoredUser();
        if (!this.auth.currentUser && stored) {
          this.upgradeStoredUser(stored);
        }
      },
      { once: true }
    );
  }

  private async signInWithNickname(name: string): Promise<void> {
    const before = this.readStoredUser();
    // Written before signing in: the auth callback fires as soon as the account
    // exists and must already find the name (and the legacy ids) here.
    this.writeStoredUser({
      name,
      anonUid: before?.anonUid,
      legacyLocalUserIds: legacyIdsOf(before),
      previousUids: before?.previousUids,
    });
    try {
      await this.ensureAnonymousSession(name);
      this.afterLogin$.next();
    } catch (error) {
      console.error("Failed to sign in with a nickname:", error);
      if (before) {
        this.writeStoredUser(before);
      } else {
        this.localStorage?.removeItem("user");
      }
      this.snackBar.open("Couldn't sign in with that nickname. Check your connection and try again.", undefined, {
        duration: 5000,
      });
    }
  }

  // One anonymous account per browser, however many tabs race to make it: a Web
  // Lock serialises them, and the `anonUid` marker tells a second tab that the
  // first has already made one even if auth hasn't synced across tabs yet.
  private async ensureAnonymousSession(name: string): Promise<void> {
    await this.withUpgradeLock(async () => {
      let authUser = this.auth.currentUser;
      const stored = this.readStoredUser();
      if (!authUser && stored?.anonUid) {
        authUser = await this.waitForCurrentUser(3000);
        if (!authUser) {
          console.warn("The nickname's anonymous account is gone; starting a new one.");
          this.writeStoredUser({
            ...stored,
            anonUid: undefined,
            previousUids: unique([...(stored.previousUids ?? []), stored.anonUid]),
          });
        }
      }
      if (!authUser) {
        authUser = (await signInAnonymously(this.auth)).user;
      }
      if (authUser.isAnonymous && authUser.displayName !== name) {
        await updateProfile(authUser, { displayName: name });
      }
      this.writeStoredUser({
        ...this.readStoredUser(),
        name,
        anonUid: authUser.isAnonymous ? authUser.uid : undefined,
      });
      this.handleAuthUser(authUser);
    });
  }

  private withUpgradeLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? (locks.request("anon-upgrade", task) as Promise<T>) : task();
  }

  // Auth state reaches other tabs by polling, so a user another tab just made can
  // take a moment to show up here.
  private async waitForCurrentUser(ms: number): Promise<FirebaseUser | null> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (this.auth.currentUser) {
        return this.auth.currentUser;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return this.auth.currentUser;
  }

  private waitForSignIn(callback?: () => void): void {
    this.snackBar.open("Connecting…", undefined, { duration: 3000 });
    const stored = this.readStoredUser();
    if (stored) {
      this.upgradeStoredUser(stored);
    }
    this.user$
      .pipe(
        filter((user) => !!user?.id),
        first(),
        timeout(15000)
      )
      .subscribe({
        next: () => callback?.(),
        error: (error) => {
          if (error instanceof TimeoutError) {
            this.snackBar.open("Couldn't connect. Please try again.", undefined, { duration: 4000 });
          }
        },
      });
  }

  private async refreshLinkedUser(linked: FirebaseUser): Promise<void> {
    // The token the link produced still names the old provider set until refreshed;
    // the rules read `firebase.identities` from it.
    await linked.getIdToken(true);
    await linked.reload();
    this.lastAuthKey = undefined;
    this.handleAuthUser(this.auth.currentUser);
  }

  // The Google account already has a poll-a-lot account, so it can't be linked
  // onto this nickname's. Signing in to it leaves the nickname account behind:
  // its uid is remembered so the person's votes and reactions still read as theirs.
  private async switchToExistingGoogleAccount(nickname: FirebaseUser, error: unknown): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent<boolean>, ConfirmDialogData<boolean>, boolean | undefined>(
          ConfirmDialogComponent,
          {
            ...defaultDialogOptions,
            data: {
              title: "Use your existing Google account?",
              message:
                "This Google account already uses Poll-a-Lot, so your nickname can't be merged into it. " +
                "Your nickname's votes and reactions stay yours. Films you added as the nickname can only be removed " +
                "by the poll owner afterwards, and its duel picks stay a separate voter.",
              confirmLabel: "Sign in with Google",
              cancelLabel: "Stay as nickname",
            },
          }
        )
        .afterClosed()
    );
    const credential = GoogleAuthProvider.credentialFromError(error as never);
    if (!confirmed || !credential) {
      return;
    }
    const stored = this.readStoredUser();
    this.writeStoredUser({
      ...stored,
      previousUids: unique([...(stored?.previousUids ?? []), nickname.uid]),
    });
    try {
      await signInWithCredential(this.auth, credential);
    } catch (signInError) {
      console.error("Failed to sign in to the existing Google account:", signInError);
      this.snackBar.open("Signing in failed.", undefined, { duration: 3000 });
    }
  }

  // Browsers on this account that remember older identities (legacy ids, left-behind
  // nickname uids) write them to users/{uid}, so another device recognises them too.
  private async rememberIds(uid: string, user: User): Promise<void> {
    const update: Record<string, unknown> = {};
    if (user.legacyLocalUserIds?.length) {
      update["legacyLocalUserIds"] = arrayUnion(...user.legacyLocalUserIds);
    }
    if (user.previousUids?.length) {
      update["previousUids"] = arrayUnion(...user.previousUids);
    }
    if (Object.keys(update).length) {
      await updateDoc(doc(this.userCollection, uid), update);
    }
  }

  // Folds ids another browser stored on users/{uid} into the viewer, so isMe()
  // recognises them here too. The guard keeps this from re-emitting forever.
  private adoptRememberedIds(userData: UserData | undefined): void {
    const current = this.getUser();
    if (!current?.id || !userData) {
      return;
    }
    const legacy = unique([...(current.legacyLocalUserIds ?? []), ...(userData.legacyLocalUserIds ?? [])]);
    const previous = unique([...(current.previousUids ?? []), ...(userData.previousUids ?? [])]);
    if (
      legacy.length === (current.legacyLocalUserIds?.length ?? 0) &&
      previous.length === (current.previousUids?.length ?? 0)
    ) {
      return;
    }
    this.user$.next({ ...current, legacyLocalUserIds: legacy, previousUids: previous });
  }

  // Read straight from localStorage (guarded for SSR): `this.localStorage` is only
  // set in afterNextRender, which can run after the first auth callback.
  private readStoredUser(): StoredUser | undefined {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("user") : null;
      return raw ? (JSON.parse(raw) as StoredUser) : undefined;
    } catch {
      return undefined;
    }
  }

  private writeStoredUser(user: StoredUser): void {
    try {
      localStorage.setItem("user", JSON.stringify(user));
    } catch {
      // Storage unavailable: the nickname just won't survive a reload.
    }
  }

  private async setupUserData(currentUserId: string) {
    if (!this.currentUserDataDoc) {
      return;
    }
    const userData = await getDoc(this.currentUserDataDoc);
    if (userData?.exists()) {
      return;
    } else {
      await setDoc(doc(this.userCollection, currentUserId), {
        id: currentUserId,
        watchlist: [],
        region: "FI",
        watchproviders: [],
        latestPolls: [],
      });
    }
  }

  // shareProfilePhoto defaults true (Google sign-in) rather than requiring
  // setupUserData to seed it — see UserData.shareProfilePhoto. Guarded by a
  // localStorage hash (not just an in-memory one) so a plain app reload, with
  // nothing actually changed, doesn't re-write this on every launch.
  private async upsertPublicProfile(user: User | undefined, userData: UserData | undefined) {
    if (!isGoogleAccount(user) || !user?.id) {
      return;
    }
    const displayName = (userData?.displayName ?? user.name ?? "").trim().slice(0, 30);
    if (!displayName) {
      return;
    }
    const shareProfilePhoto = userData?.shareProfilePhoto ?? true;
    const photoURL = shareProfilePhoto ? user.photoURL ?? null : null;

    const hashKey = `publicProfileHash:${user.id}`;
    const hash = `${displayName}|${photoURL}`;
    if (this.localStorage?.getItem(hashKey) === hash) {
      return;
    }

    const profile: PublicProfile = { uid: user.id, displayName, photoURL, updatedAt: Date.now() };
    await setDoc(doc(this.firestore, `publicProfiles/${user.id}`), profile);
    this.localStorage?.setItem(hashKey, hash);
    this.userIdentityService.invalidate(user.id);
  }
}
