import {
  BrowserModule,
  provideClientHydration,
} from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { inject, NgModule, PLATFORM_ID, isDevMode } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { getFirestore, provideFirestore } from "@angular/fire/firestore";
import { environment } from "../environments/environment";
import { FIREBASE_OPTIONS } from "@angular/fire/compat";
// import { PushNotificationModule } from "ng-push-notification";

//import { MatCardModule, MatButtonModule, MatInputModule, MatIconModule, MatDialogModule, MatMenuModule, MatToolbarModule, MatSnackBarModule, MatDividerModule, MatSlideToggleModule, MatAutocompleteModule, MatTooltipModule, MatListModule } from '@angular/material';
import { AppComponent } from "./app.component";
import { PollComponent, TotalDurationPipe, TotalPollItemsPipe, TotalVotesPipe } from "./poll/poll.component";
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
import {
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
} from "@angular/common/http";
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
import { MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { DragDropModule } from "@angular/cdk/drag-drop";
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  MatFormFieldModule,
} from "@angular/material/form-field";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { ProductionCoutryPipe } from "./production-country.pipe";
import { VotersPipe } from "./voters.pipe";
import { WatchProviderSelectComponent } from "./watch-providers/watch-providers.component";
import { WatchListComponent } from "./watch-list/watch-list.component";
import { WatchListMarker } from "./watch-list-marker/watch-list-marker.component";
import { WatchListItemComponent } from "./watch-list/watch-list-item/watch-list-item.component";
import { ScreenHeightPipe } from "./screen-height.pipe";
import { LoginButtonComponent } from "./login-button/login-button.component";
import { HyphenatePipe } from "./hyphen.pipe";
import { LetterboxdService } from "./letterboxd.service";
import { getApp, initializeApp, provideFirebaseApp } from "@angular/fire/app";
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
  provideAppCheck,
} from "@angular/fire/app-check";
import { provideAnalytics, getAnalytics } from "@angular/fire/analytics";
import { getFunctions, provideFunctions } from "@angular/fire/functions";
import { getAuth, provideAuth } from "@angular/fire/auth";
import { PosterComponent } from "./poster/poster.component";
import {
  DateAdapter,
  MAT_DATE_LOCALE,
  MatNativeDateModule,
  MatRippleModule,
} from "@angular/material/core";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { EditPollDialogComponent } from "./poll/edit-poll-dialog/edit-poll-dialog.component";
import { DatePipe, isPlatformServer } from "@angular/common";
import { CustomDateAdapter } from "./custom-date-adapter";
import { PollLinkCopyComponent } from "./poll-link-copy/poll-link-copy.component";
import { MovieSearchInputComponent } from "./movie-search-input/movie-search-input.component";
import { GeminiService } from "./gemini.service";
import { LatestReviewsComponent } from "./latest-reviews/latest-reviews.component";
import { LatestReviewItemComponent } from "./latest-reviews/latest-review-item/latest-review-item.component";
import { MovieDialogService } from "./movie-dialog.service";
import { ButtonGradientComponent } from "./shared/button-gradient/button-gradient.component";
import { getAI, GoogleAIBackend, provideAI } from "@angular/fire/ai";
import { MarkdownPipe } from "./markdown.pipe";

const appRoutes: Routes = [
  { path: "poll/:id", component: PollComponent },
  { path: "manage", component: PollManagementComponent },
  { path: "add-poll", component: AddPollComponent },
  { path: "about", component: AboutComponent },
  { path: "watchlist", component: WatchListComponent },
  { path: "", component: LandingComponent },
  { path: "movie/:id", component: LandingComponent},
  { path: "**", redirectTo: "/", pathMatch: "full" },
  // index page --> route ** to index page
];

export const APP_NAME: string = "poll-a-lot";

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
    WatchListComponent,
    WatchListItemComponent,
    LoginButtonComponent,
    EditPollDialogComponent,
    LatestReviewsComponent,
    LatestReviewItemComponent,
  ],
  bootstrap: [AppComponent],
  imports: [
    BrowserAnimationsModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
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
    MatSlideToggleModule,
    MatBottomSheetModule,
    MatRippleModule,
    DragDropModule,
    BrowserModule,
    RouterModule.forRoot(appRoutes, {
      scrollPositionRestoration: "disabled",
    }),
    ClipboardModule,
    // PushNotificationModule.forRoot(),
    ServiceWorkerModule.register("/ngsw-worker.js", {
      enabled: environment.production,
    }),
    MovieScoreComponent,
    PosterComponent,
    SpinnerComponent,
    WatchProviderSelectComponent,
    LazyLoadImageModule,
    MatFormFieldModule,
    MatSelectModule,
    MovieCreditPipe,
    ProductionCoutryPipe,
    VotersPipe,
    WatchListMarker,
    ScreenHeightPipe,
    HyphenatePipe,
    TotalDurationPipe,
    TotalVotesPipe,
    TotalPollItemsPipe,
    MarkdownPipe,
    PollLinkCopyComponent,
    MovieSearchInputComponent,
    ServiceWorkerModule.register("ngsw-worker.js", {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: "registerWhenStable:30000",
    }),
    ButtonGradientComponent
  ],
  providers: [
    { provide: FIREBASE_OPTIONS, useValue: environment.firebase },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: "fill" },
    },
    provideFirebaseApp(() => initializeApp(environment.firebase, APP_NAME)),
    provideAppCheck(() => {
      // Don't initialise AppCheck if running in server
      // Workaround for https://github.com/angular/angularfire/issues/3488
      const platformId = inject(PLATFORM_ID);
      if (isPlatformServer(platformId)) {
        return;
      }
      return initializeAppCheck(getApp(APP_NAME), {
        provider: new ReCaptchaEnterpriseProvider(
          environment.recaptcheV3SiteKey
        ),
        isTokenAutoRefreshEnabled: true,
      });
    }),
    provideFirestore(() => getFirestore(getApp(APP_NAME))),
    provideFunctions(() => getFunctions(getApp(APP_NAME))),
    provideAuth(() => getAuth(getApp(APP_NAME))),
    provideAI(() => getAI(getApp(APP_NAME), {backend: new GoogleAIBackend()})),
    provideAnalytics(() => getAnalytics(getApp(APP_NAME))),
    UserService,
    NightModeService,
    TMDbService,
    LetterboxdService,
    LocalCacheService,
    LocalStorageService,
    UpdateService,
    PollItemService,
    ApplicationDataService,
    GeminiService,
    MovieDialogService,
    MovieCreditPipe,
    ProductionCoutryPipe,
    DatePipe,
    {
      provide: DateAdapter,
      useClass: CustomDateAdapter,
    },
    { provide: MAT_DATE_LOCALE, useValue: "en-FI" },
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideClientHydration(),
  ],
})
export class AppModule {
  constructor(updateService: UpdateService, userService: UserService) {
    userService.init();
  }
}
