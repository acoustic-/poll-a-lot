import { BrowserModule } from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AngularFireModule } from 'angularfire2';
import { AngularFirestoreModule } from 'angularfire2/firestore';
import { AngularFireAuthModule } from 'angularfire2/auth';
import { environment } from '../environments/environment';
import { PushNotificationModule } from 'ng-push-notification';

import { MatCardModule, MatButtonModule, MatInputModule, MatIconModule, MatDialogModule, MatMenuModule, MatToolbarModule, MatSnackBarModule, MatDividerModule, MatSlideToggleModule, MatAutocompleteModule, MatTooltipModule, MatListModule } from '@angular/material';
import { AppComponent } from './app.component';
import { PollComponent } from './poll/poll.component';
import { AddPollComponent } from './add-poll/add-poll.component';
import { HeaderComponent } from './header/header.component';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LandingComponent } from './landing/landing.component';
import { UserService } from './user.service';
import { ShareDialogComponent } from './share-dialog/share-dialog.component';
import { ClipboardModule } from 'ngx-clipboard';
import { TransitionGroupItemDirective, TransitionGroupComponent } from './transition-group-item.directive';

import { ServiceWorkerModule } from '@angular/service-worker';
import { PollManagementComponent } from './poll-management/poll-management.component';
import { SpinnerComponent } from './spinner/spinner.component';
import { FooterComponent } from './footer/footer.component';
import { NightModeService } from './night-mode-service.service';
import { MoviePollItemComponent } from './movie-poll-item/movie-poll-item.component';
import { HttpClientModule } from '@angular/common/http';
import { TMDbService } from './tmdb.service';
import { LocalCacheService } from './local-cache.service';
import { LocalStorageService } from './local-storage.service';
import { VoterComponent } from './voter/voter.component';
import { PollOptionDialogComponent } from './poll-option-dialog/poll-option-dialog.component';
import { AboutComponent } from './about/about.component';
import { SeriesPollItemComponent } from './series-poll-item/series-poll-item.component';

const appRoutes: Routes = [
  { path: 'poll/:id', component: PollComponent },
  //{ path: 'polls/manage/:id', component: PollManagementComponent },
  { path: 'manage', component: PollManagementComponent },
  { path: 'add-poll', component: AddPollComponent },
  { path: 'about', component: AboutComponent },
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
    PollManagementComponent,
    SpinnerComponent,
    FooterComponent,
    MoviePollItemComponent,
    SeriesPollItemComponent,
    VoterComponent,
    PollOptionDialogComponent,
    AboutComponent,
  ],
  imports: [
    HttpClientModule,
    BrowserAnimationsModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    MatToolbarModule,
    MatSnackBarModule,
    MatDividerModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatListModule,
    BrowserModule,
    AngularFireModule.initializeApp(environment.firebase, 'poll-a-lot'),
    AngularFirestoreModule,
    AngularFireAuthModule,
    RouterModule.forRoot(
      appRoutes
    ),
    
    ClipboardModule,
    ServiceWorkerModule.register('/ngsw-worker.js', {enabled: environment.production}),
    PushNotificationModule.forRoot(),
    
  ],
  entryComponents: [ ShareDialogComponent, LoginDialogComponent, PollOptionDialogComponent ],
  providers: [UserService, NightModeService, HttpClientModule, TMDbService, LocalCacheService, LocalStorageService],
  bootstrap: [AppComponent]
})
export class AppModule { }
