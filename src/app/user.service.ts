import { afterNextRender, Injectable, Injector, OnInit, runInInjectionContext, inject } from "@angular/core";
import { Observable, BehaviorSubject, Subject, NEVER, firstValueFrom } from "rxjs";
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
} from "rxjs/operators";
import { v4 as uuidv4 } from "uuid";
import { WatchlistItem } from "../model/tmdb";
import { Poll } from "../model/poll";
import {
  DocumentReference,
  Firestore,
  collection,
  deleteDoc,
  doc,
  docData,
  getDoc,
  setDoc,
  updateDoc,
} from "@angular/fire/firestore";
import { Auth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "@angular/fire/auth";
import { defaultDialogOptions } from "./common";
import { UserIdentityService } from "./user-identity.service";
import { environment } from "../environments/environment";

@Injectable()
export class UserService implements OnInit {
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
  afterLogin$: Subject<{}> = new Subject();
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
        onAuthStateChanged(this.auth, async (user) => {
          const storageUser = this.loadUser();

          if (!user && storageUser && storageUser.id === undefined) {
            this.user$.next(storageUser);
            this.authResolved$.next(true);
            return;
          }

          const name = user
            ? user.displayName?.split(" ")[0].length
              ? user.displayName.split(" ")[0]
              : user.displayName ?? undefined
            : undefined;
          const localUser = user ? { id: user.uid, name: name, photoURL: user.photoURL ?? undefined } : undefined;
          this.user$.next(localUser);

          if (localUser?.id) {
            this.currentUserDataDoc = doc(this.userCollection, localUser.id) as DocumentReference<UserData>;
            this.setupUserData(localUser.id);
            this.ngOnInit();
            // A signed-in Google user never needs the first-visit welcome
            // dialog, even if they never actually saw or dismissed it
            // themselves (e.g. it shipped after they'd already signed in).
            this.markWelcomeSeen();
          } else {
            this.currentUserDataDoc = undefined;
          }

          this.authResolved$.next(true);
          this.init();
        })
      );

      this.subs.add(
        this.user$
          .asObservable()
          .pipe(
            filter((user): user is User & { id: string } => !!user?.id),
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
            this.upsertPublicProfile(user, userData).catch((err) =>
              console.error("Failed to publish public profile:", err)
            );
          })
      );

      this.init();
  }

  ngOnInit() {}

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  init() {
    this.loadRegion();
    this.loadWatchProviders();
    this.loadRecentPolls();
    this.loadFavoritePolls();
  }

  saveUser(user: User): void {
    if (user && user.id === undefined) {
      this.localStorage?.setItem("user", JSON.stringify(user));
    }
  }

  loadUser(): User | undefined {
    const user = this.localStorage?.getItem("user");
    if (user) {
      return JSON.parse(user);
    }
    return undefined;
  }

  openLoginDialog(requireStrongAuth = false): void {
    let dialogRef = this.dialog.open(LoginDialogComponent, {
      ...defaultDialogOptions,
      data: { username: "", userService: this, requireStrongAuth },
    });

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((result) => {
        if (result && result.length > 0) {
          const user: User = {
            name: result,
            localUserId: this.generateLocalUserId(),
          };
          this.user$.next(user);
          this.saveUser(user);
          this.afterLogin$.next({});
        }
      });

    this.user$
      .pipe(
        filter(
          (user) =>
            user !== undefined &&
            (requireStrongAuth === true ? user.id !== undefined : true)
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

  login() {
    signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  logout() {
    const snack = this.snackBar.open("Are you sure?", "Log out", {
      duration: 3000,
    });
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

  usersAreEqual(a: User | undefined, b: User | undefined): boolean {
    if (a === undefined || b === undefined) {
      return false;
    }
    if (a.id && b.id) {
      return a.id === b.id;
    }
    return a.name === b.name && a.localUserId === b.localUserId;
  }

  getUser(): User | undefined {
    return this.user$.getValue();
  }

  isCurrentUser(user: User): boolean {
    return this.getUser() ? this.usersAreEqual(user, this.getUser()) : false;
  }

  isLoggedIn(): boolean {
    return this.user$.getValue() !== undefined;
  }

  isGoogleUser(): boolean {
    return this.user$.getValue()?.id !== undefined;
  }

  generateLocalUserId(): string {
    return uuidv4();
  }

  getUserOrOpenLogin(
    cp?: () => void,
    requireStrongAuth = false
  ): User | undefined {
    const user = this.getUser();
    if (user && (requireStrongAuth === true ? user.id !== undefined : true)) {
      return user;
    } else {
      this.openLoginDialog(requireStrongAuth);
      this.user$
        .pipe(
          filter(
            (user) =>
              user !== undefined &&
              (requireStrongAuth === true ? user.id !== undefined : true)
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
    if (!user?.id) {
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
        const region = (userDataSnap.data() as any)?.region || "FI";
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
          (userDataSnap.data() as any)?.watchproviders ||
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
        const recentPolls = (userDataSnap.data() as any)?.latestPolls || [];
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
        const favoritePolls = (userDataSnap.data() as any)?.favoritePolls || [];
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
    } else if (this.getUser()?.localUserId !== undefined) {
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
    } else if (this.getUser()?.localUserId !== undefined) {
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
    } else if (this.getUser()?.localUserId !== undefined) {
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
    } else if (this.getUser()?.localUserId !== undefined) {
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
        filter((user) => user?.id !== undefined),
        take(1),
        takeUntil(dialogRef.afterClosed())
      )
      .subscribe(() => dialogRef.close());
  }

  private async setupUserData(currentUserId: string) {
    if (!this.currentUserDataDoc) {
      return;
    }
    const userData = await getDoc(this.currentUserDataDoc);
    if (userData?.exists()) {
      return;
    } else {
      setDoc(doc(this.userCollection, currentUserId), {
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
    if (!user?.id) {
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
