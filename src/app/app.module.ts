import { BrowserModule } from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AngularFireModule } from 'angularfire2';
import { AngularFirestoreModule } from 'angularfire2/firestore';
import { AngularFireAuthModule } from 'angularfire2/auth';
import { environment } from '../environments/environment';

import { MatCardModule, MatButtonModule, MatInputModule, MatIconModule, MatDialogModule, MatMenuModule, MatToolbarModule } from '@angular/material';
import { AppComponent } from './app.component';
import { PollComponent } from './poll/poll.component';
import { AddPollComponent } from './add-poll/add-poll.component';
import { HeaderComponent } from './header/header.component';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';

import { FormsModule } from '@angular/forms';
import { LandingComponent } from './landing/landing.component';
import { UserService } from './user.service';
import { ShareDialogComponent } from './share-dialog/share-dialog.component';
import { ClipboardModule } from 'ngx-clipboard';
import { TransitionGroupItemDirective, TransitionGroupComponent } from './transition-group-item.directive';

import { ServiceWorkerModule } from '@angular/service-worker';

const appRoutes: Routes = [
  { path: 'poll/:id', component: PollComponent },
  { path: 'add-poll', component: AddPollComponent },
  { path: '',   component: LandingComponent },
  { path: '**',   redirectTo: '/', pathMatch: 'full' },
  // index page --> route ** to index page
  // add new poll
  // edit your polls
  // login
];

@NgModule({
  declarations: [
    AppComponent,
    PollComponent,
    AddPollComponent,
    HeaderComponent,
    LoginDialogComponent,
    LandingComponent,
    ShareDialogComponent,
    TransitionGroupItemDirective,
    TransitionGroupComponent,
  ],
  imports: [
    BrowserAnimationsModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    MatToolbarModule,
    BrowserModule,
    AngularFireModule.initializeApp(environment.firebase, 'poll-a-lot'),
    AngularFirestoreModule,
    AngularFireAuthModule,
    RouterModule.forRoot(
      appRoutes
    ),
    ClipboardModule,
    environment.production ? ServiceWorkerModule.register('ngsw-worker.js') : [],
    
  ],
  entryComponents: [ ShareDialogComponent, LoginDialogComponent ],
  providers: [UserService],
  bootstrap: [AppComponent]
})
export class AppModule { }
