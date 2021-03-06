import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { AngularFireAuth } from 'angularfire2/auth';
import { User } from '../model/poll';
import { MatDialog, MatSnackBar } from '@angular/material';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import * as firebase from 'firebase/app';

@Injectable()
export class UserService {

  user$: Observable<User | undefined>;
  userSubject: BehaviorSubject<User | undefined>;

  constructor(
    public afAuth: AngularFireAuth,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.userSubject = new BehaviorSubject<User | undefined>(undefined);
    this.user$ = this.userSubject.asObservable();

    const storageUser = this.loadUser();
    if (storageUser) {
      this.userSubject.next(storageUser);
    }

    afAuth.authState.map(user => {
      const localUser = user ? { id: user.uid } : undefined;
      this.userSubject.next(localUser);
    }).subscribe();
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

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      if (result && result.length > 0) {
        const user: User = { name: result };
        this.userSubject.next(user);
        this.saveUser(user);
      }
    });
  }

  login() {
    this.afAuth.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

    this.afAuth.authState.map(user => {
      if (user) {
        this.snackBar.open("Logged in!", undefined, {duration: 2000});
      } else {
        this.snackBar.open("Logging in failed!", undefined, {duration: 2000});
      }
    }).skip(1).take(1).subscribe();
  }
  logout() {
    console.log("logout");
    this.afAuth.auth.signOut();
    localStorage.removeItem('user');
    this.userSubject.next(undefined);
    this.snackBar.open("Logged out!", undefined, {duration: 2000});
  }

  usersAreEqual(a: User, b: User): boolean {
    if (a.id && b.id) {
      return a.id === b.id;
    }
    return a.name === b.name;
  }
}
