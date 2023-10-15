import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { AngularFireModule } from "@angular/fire/compat";
import { AngularFirestoreModule } from "@angular/fire/compat/firestore/";
import { AngularFireAuthModule } from "@angular/fire/compat/auth";
import { environment } from "../environments/environment";
// import { PushNotificationModule } from "ng-push-notification";

//import { MatCardModule, MatButtonModule, MatInputModule, MatIconModule, MatDialogModule, MatMenuModule, MatToolbarModule, MatSnackBarModule, MatDividerModule, MatSlideToggleModule, MatAutocompleteModule, MatTooltipModule, MatListModule } from '@angular/material';
import { AppComponent } from "./app.component";
import { PollComponent } from "./poll/poll.component";
import { AddPollComponent } from "./add-poll/add-poll.component";
import { HeaderComponent } from "./header/header.component";
import { LoginDialogComponent } from "./login-dialog/login-dialog.component";

import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { LandingComponent } from "./landing/landing.component";
import { UserService } from "./user.service";
import { ShareDialogComponent } from "./share-dialog/share-dialog.component";
import { ClipboardModule } from "ngx-clipboard";
import {
  TransitionGroupItemDirective,
  TransitionGroupComponent,
} from "./transition-group-item.directive";

import { ServiceWorkerModule } from "@angular/service-worker";
import { PollManagementComponent } from "./poll-management/poll-management.component";
import { SpinnerComponent } from "./spinner/spinner.component";
import { FooterComponent } from "./footer/footer.component";
import { NightModeService } from "./night-mode-service.service";
import { MoviePollItemComponent } from "./movie-poll-item/movie-poll-item.component";
import { HttpClientModule } from "@angular/common/http";
import { TMDbService } from "./tmdb.service";
import { LocalCacheService } from "./local-cache.service";
import { LocalStorageService } from "./local-storage.service";
import { VoterComponent } from "./voter/voter.component";
import { PollOptionDialogComponent } from "./poll-option-dialog/poll-option-dialog.component";
import { AboutComponent } from "./about/about.component";
import { SeriesPollItemComponent } from "./series-poll-item/series-poll-item.component";
import { UpdateService } from "./update.service";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatDividerModule } from "@angular/material/divider";
import { MatMenuModule } from "@angular/material/menu";
import { MatIconModule } from "@angular/material/icon";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatInputModule } from "@angular/material/input";
import { ClickOutsideDirective } from "./click-outside.directive";
import { PollItemService } from "./poll-item.service";
import { ApplicationDataService } from "./data-service";
import { MovieScoreComponent } from "./movie-poll-item/movie-score/movie-score.component";
import { SortPipe } from "./poll-item-sort.pipe";
import { LazyLoadImageModule } from "ng-lazyload-image";

import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { ProductionCoutryPipe } from "./production-country.pipe";
import { VotersPipe } from "./voters.pipe";

const appRoutes: Routes = [
  { path: "poll/:id", component: PollComponent },
  { path: "manage", component: PollManagementComponent },
  { path: "add-poll", component: AddPollComponent },
  { path: "about", component: AboutComponent },
  { path: "", component: LandingComponent },
  { path: "**", redirectTo: "/", pathMatch: "full" },
  // index page --> route ** to index page
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
    FooterComponent,
    MoviePollItemComponent,
    SeriesPollItemComponent,
    VoterComponent,
    PollOptionDialogComponent,
    AboutComponent,
    ClickOutsideDirective,
    SortPipe,
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
    AngularFireModule.initializeApp(environment.firebase, "poll-a-lot"),
    AngularFirestoreModule,
    AngularFireAuthModule,
    RouterModule.forRoot(appRoutes),
    ClipboardModule,
    // PushNotificationModule.forRoot(),
    ServiceWorkerModule.register("ngsw-worker.js", {
      enabled: environment.production,
    }),
    MovieScoreComponent,
    SpinnerComponent,
    LazyLoadImageModule,
    MatFormFieldModule,
    MatSelectModule,
    MovieCreditPipe,
    ProductionCoutryPipe,
    VotersPipe,
  ],
  providers: [
    UserService,
    NightModeService,
    HttpClientModule,
    TMDbService,
    LocalCacheService,
    LocalStorageService,
    UpdateService,
    PollItemService,
    ApplicationDataService,
    MovieCreditPipe,
    ProductionCoutryPipe,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
  constructor(updateService: UpdateService, userService: UserService) {}
}
