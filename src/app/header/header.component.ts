import { Component } from '@angular/core';
import { AngularFireAuth } from 'angularfire2/auth';
import * as firebase from 'firebase/app';
import { Router } from '@angular/router';
import { UserService } from '../user.service';
import { Observable } from 'rxjs/Observable';
import { User } from '../../model/poll';

@Component({
  selector: 'header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {

  user$: Observable<User>;

  constructor(
    private router: Router,
    private userService: UserService) {
      this.user$ = this.userService.user$;
  }
  login() {
    this.userService.openLoginDialog();
  }
  logout() {
    this.userService.logout();
  }

  addPoll() {
    this.router.navigate(['/add-poll']);
  }

  goToRoot() {
    this.router.navigate(['/']);
  }

  manage() {
    this.router.navigate(['/manage']);
  }
}