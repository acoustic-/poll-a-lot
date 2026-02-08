import { afterNextRender, Injectable, OnInit } from "@angular/core";
import { Observable, BehaviorSubject, Subject, NEVER, firstValueFrom } from "rxjs";
import { User, UserData } from "../model/user";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LoginDialogComponent } from "./login-dialog/login-dialog.component";
import {
  map,
  filter,
  take,
  tap,
  first,
  switchMap,
  takeUntil,
} from "rxjs/operators";
import { v4 as uuidv4 } from "uuid";
import { WatchlistItem } from "../model/tmdb";
import { Poll } from "../model/poll";
import {
  DocumentReference,
  Firestore,
  collection,
  doc,
  docData,
  getDoc,
  setDoc,
  updateDoc,
} from "@angular/fire/firestore";
import { Auth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "@angular/fire/auth";
import { defaultDialogOptions } from "./common";

@Injectable()
export class UserService implements OnInit {
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

  defaultWatchProviders = [337, 8, 119, 384, 323, 463];

  subs = NEVER.subscribe();

  constructor(
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    private auth: Auth
  ) {
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
            return;
          }

          const name = user
            ? user.displayName?.split(" ")[0].length
              ? user.displayName.split(" ")[0]
              : user.displayName ?? undefined
            : undefined;
          const localUser = user ? { id: user.uid, name: name } : undefined;
          this.user$.next(localUser);

          if (localUser?.id) {
            this.currentUserDataDoc = doc(this.userCollection, localUser.id) as DocumentReference<UserData>;
            this.setupUserData(localUser.id);
            this.ngOnInit();
          } else {
            this.currentUserDataDoc = undefined;
          }

          this.init();
        })
      );

      this.subs.add(
        this.user$
          .asObservable()
          .pipe(
            map((user) => user?.id),
            filter((userId) => !!userId),
            switchMap(
              (userId) =>
                docData(
                  doc(this.firestore, `users/${userId}`)
                ) as Observable<UserData>
            )
          )
          .subscribe((data) => this.userData$.next(data))
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
      const userData = await firstValueFrom(
        docData(this.currentUserDataDoc)
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

  private async setupUserData(currentUserId: string) {
    if (!this.currentUserDataDoc) {
      return;
    }
    const userData = await getDoc(this.currentUserDataDoc);
    if (userData?.id) {
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
}
