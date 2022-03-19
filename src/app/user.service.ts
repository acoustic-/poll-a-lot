import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { User } from '../model/poll';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';
import firebase from 'firebase/compat/app';
import { map, filter, skip, take } from 'rxjs/operators';

@Injectable()
export class UserService {

  user$: Observable<User | undefined>;
  userSubject: BehaviorSubject<User | undefined>;
  afterLogin$: Subject<{}>;

  constructor(
    public auth: AngularFireAuth,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.userSubject = new BehaviorSubject<User | undefined>(undefined);
    this.user$ = this.userSubject.asObservable();

    const storageUser = this.loadUser();
    if (storageUser) {
      this.userSubject.next(storageUser);
    }

    auth.authState.pipe(map(user => {
      const name = user ? user.displayName.split(' ')[0].length ? user.displayName.split(' ')[0] : user.displayName : undefined;
      const localUser = user ? { id: user.uid, name: name } : undefined;
      this.userSubject.next(localUser);
    })).subscribe();
  }

  saveUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }

  loadUser(): User | undefined {
    const user = localStorage.getItem('user');
    if (user) {
      return JSON.parse(user);
    }
    return undefined;
  }

  openLoginDialog(): void {
    let dialogRef = this.dialog.open(LoginDialogComponent, {
      width: '250px',
      data: { username: '', userService: this }
    });

    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      console.log('The dialog was closed');
      if (result && result.length > 0) {
        const user: User = { name: result };
        this.userSubject.next(user);
        this.saveUser(user);
        this.afterLogin$.next();
      }
    });

    this.user$.pipe(filter(user => user != undefined), take(1)).subscribe(() => {
      dialogRef.close();
    });
  }

  login() {
    this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

    this.auth.authState.pipe(skip(1),take(1)).subscribe(user => {
      if (user) {
        this.snackBar.open("Logged in!", undefined, {duration: 2000});
      } else {
        this.snackBar.open("Logging in failed!", undefined, {duration: 2000});
      }
    });
  }

  logout() {
    const snack = this.snackBar.open("Are you sure?", 'Log out', {duration: 3000});
    snack.onAction().subscribe(() => {
      console.log("logout");
      this.auth.signOut();
      localStorage.removeItem('user');
      this.userSubject.next(undefined);
      this.snackBar.open("Logged out!", undefined, {duration: 2000});
    });
  }

  usersAreEqual(a: User | undefined, b: User | undefined): boolean {
    if (a === undefined || b === undefined) {
      return false;
    }
    if (a.id && b.id) {
      return a.id === b.id;
    }
    return a.name === b.name;
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
}
