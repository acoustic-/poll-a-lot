import { Injectable, OnInit } from "@angular/core";
import { Observable, BehaviorSubject, Subject, NEVER } from "rxjs";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { User, UserData } from "../model/user";
import {
  AngularFirestore,
  AngularFirestoreCollection,
  AngularFirestoreDocument,
} from "@angular/fire/compat/firestore";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LoginDialogComponent } from "./login-dialog/login-dialog.component";
import firebase from "firebase/compat/app";
import {
  map,
  filter,
  skip,
  take,
  tap,
  first,
  switchMap,
  takeUntil,
} from "rxjs/operators";
import { v4 as uuidv4 } from "uuid";
import { WatchlistItem } from "../model/tmdb";
import { Poll } from "../model/poll";

@Injectable()
export class UserService implements OnInit {
  private userCollection: AngularFirestoreCollection<UserData>;
  private currentUserDataCollection:
    | AngularFirestoreDocument<UserData>
    | undefined;

  user$: Observable<User | undefined>;
  userSubject = new BehaviorSubject<User | undefined>(undefined);
  afterLogin$: Subject<{}> = new Subject();
  userData$: Observable<UserData | undefined>;

  selectedWatchProviders$ = new BehaviorSubject<number[]>([]);
  selectedRegion$ = new BehaviorSubject<string>("FI");

  defaultWatchProviders = [337, 8, 119, 384, 323, 463];

  subs = NEVER.subscribe();

  constructor(
    public auth: AngularFireAuth,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    private readonly afs: AngularFirestore
  ) {
    this.user$ = this.userSubject.asObservable();
    this.userCollection = afs.collection<UserData>("users");

    const storageUser = this.loadUser();
    if (storageUser && storageUser.id === undefined) {
      this.userSubject.next(storageUser);
    }

    this.subs.add(
      auth.authState
        .pipe(
          skip(storageUser ? 1 : 0),
          map((user) => {
            const name = user
              ? user.displayName.split(" ")[0].length
                ? user.displayName.split(" ")[0]
                : user.displayName
              : undefined;
            const localUser = user ? { id: user.uid, name: name } : undefined;
            this.userSubject.next(localUser);

            if (localUser?.id) {
              this.currentUserDataCollection = this.userCollection.doc(
                localUser.id
              );
              this.setupUserData(localUser.id);
              this.ngOnInit();
            } else {
              this.currentUserDataCollection = undefined;
            }
          })
        )
        .subscribe()
    );

    this.userData$ = this.userSubject.asObservable().pipe(
      map((user) => user?.id),
      filter((userId) => !!userId),
      switchMap((userId) => this.userCollection.doc(userId).valueChanges())
    );
  }

  ngOnInit() {
    this.init();
  }
  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  init() {
    this.loadRegion();
    this.loadWatchProviders();
  }

  saveUser(user: User): void {
    if (user && user.id === undefined) {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }

  loadUser(): User | undefined {
    const user = localStorage.getItem("user");
    if (user) {
      return JSON.parse(user);
    }
    return undefined;
  }

  openLoginDialog(requireStrongAuth = false): void {
    let dialogRef = this.dialog.open(LoginDialogComponent, {
      width: "400px",
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
          this.userSubject.next(user);
          this.saveUser(user);
          this.afterLogin$.next();
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
      .subscribe(() => {
        dialogRef.close();
      });
  }

  login() {
    this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

    this.auth.authState.pipe(skip(1), take(1)).subscribe((user) => {
      if (user) {
        this.snackBar.open("Logged in!", undefined, { duration: 2000 });
      } else {
        this.snackBar.open("Logging in failed!", undefined, { duration: 2000 });
      }
    });
  }

  logout() {
    const snack = this.snackBar.open("Are you sure?", "Log out", {
      duration: 3000,
    });
    snack.onAction().subscribe(() => {
      this.auth.signOut();
      localStorage.removeItem("user");
      this.userSubject.next(undefined);
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

  getUser(): User {
    return this.userSubject.getValue();
  }

  isCurrentUser(user: User): boolean {
    return this.getUser() ? this.usersAreEqual(user, this.getUser()) : false;
  }

  isLoggedIn(): boolean {
    return this.userSubject.getValue() !== undefined;
  }

  isGoogleUser(): boolean {
    return this.userSubject.getValue().id !== undefined;
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
      localStorage.setItem("region", region);
      this.selectedRegion$.next(region);

      if (this.currentUserDataCollection) {
        this.currentUserDataCollection.update({ region });
      }
    }
  }

  loadRegion() {
    if (this.currentUserDataCollection) {
      this.currentUserDataCollection
        .get()
        .first()
        .subscribe((snap) => {
          const region = snap.data()?.region || "FI";
          this.selectedRegion$.next(region || "FI");
        });
    } else {
      const region = localStorage.getItem("region");
      this.selectedRegion$.next(region || "FI");
    }
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

    if (this.currentUserDataCollection) {
      this.currentUserDataCollection.update({ watchproviders: updated });
    }
  }

  setWatchProviders(watchProvidersIds: number[]) {
    this.selectedWatchProviders$.next(watchProvidersIds);

    if (this.currentUserDataCollection) {
      this.currentUserDataCollection.update({
        watchproviders: watchProvidersIds,
      });
    } else {
      localStorage.setItem(
        "watch_providers",
        JSON.stringify(watchProvidersIds)
      );
    }
  }

  loadWatchProviders() {
    if (this.currentUserDataCollection) {
      this.currentUserDataCollection
        .get()
        .first()
        .subscribe((snap) => {
          const watchProviders =
            snap.data()?.watchproviders || this.defaultWatchProviders;
          this.selectedWatchProviders$.next(watchProviders);
        });
    } else {
      const watchProvidersStr = localStorage.getItem("watch_providers");
      const watchProviders =
        JSON.parse(watchProvidersStr) || this.defaultWatchProviders;
      this.selectedWatchProviders$.next(watchProviders);
    }
  }

  toggleWatchlistMovie(
    watchlistItem: WatchlistItem,
    watchlist: WatchlistItem[]
  ) {
    if (this.currentUserDataCollection) {
      const removeMovie = watchlist.some(
        (watchlistMovie) =>
          watchlistMovie.moviePollItemData.id ===
          watchlistItem.moviePollItemData.id
      );
      const updated = removeMovie
        ? watchlist.filter(
            (watchlistMovie) =>
              watchlistMovie.moviePollItemData.id !==
              watchlistItem.moviePollItemData.id
          )
        : [...watchlist, watchlistItem];
      return this.currentUserDataCollection.update({ watchlist: updated });
    }
  }

  setRecentPoll(poll: Poll) {
    const maxLatestPolls = 20;
    if (poll && this.currentUserDataCollection) {
      this.currentUserDataCollection
        .get()
        .first()
        .subscribe((snap) => {
          const add = { id: poll.id, name: poll.name };
          const latestPolls = [
            add,
            ...(snap.data()?.latestPolls || []).filter((p) => p.id !== poll.id),
          ].slice(0, maxLatestPolls);
          this.currentUserDataCollection.update({ latestPolls });
        });
    }
  }

  getUserData$(): Observable<UserData> {
    return this.userData$;
  }

  private setupUserData(currentUserId: string) {
    this.currentUserDataCollection
      .get()
      .first()
      .subscribe((snap) => {
        const userData = snap.data();
        if (userData?.id) {
          return;
        } else {
          this.currentUserDataCollection.set({
            id: currentUserId,
            watchlist: [],
            region: "FI",
            watchproviders: [],
            latestPolls: [],
          });
        }
      });
  }
}
