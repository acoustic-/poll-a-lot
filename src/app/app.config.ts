import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  isDevMode,
  PLATFORM_ID,
  provideAppInitializer,
} from "@angular/core";
import { FIREBASE_OPTIONS } from "@angular/fire/compat";
import {
  provideFirebaseApp,
  initializeApp,
  getApp,
} from "@angular/fire/app";
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
  provideAppCheck,
} from "@angular/fire/app-check";
import { isPlatformServer, DatePipe, I18nPluralPipe } from "@angular/common";
import {
  provideFirestore,
  getFirestore,
  connectFirestoreEmulator,
} from "@angular/fire/firestore";
import { provideFunctions, getFunctions } from "@angular/fire/functions";
import {
  provideAuth,
  getAuth,
  connectAuthEmulator,
} from "@angular/fire/auth";
import { provideAI, getAI, GoogleAIBackend } from "@angular/fire/ai";
import { provideAnalytics, getAnalytics } from "@angular/fire/analytics";
import { environment } from "../environments/environment";
import { UserService } from "./user.service";
import { NightModeService } from "./night-mode-service.service";
import { TMDbService } from "./tmdb.service";
import { LetterboxdService } from "./letterboxd.service";
import { LocalCacheService } from "./local-cache.service";
import { LocalStorageService } from "./local-storage.service";
import { RecentSearchesService } from "./recent-searches.service";
import { UpdateService } from "./update.service";
import { PollItemService } from "./poll-item.service";
import { ApplicationDataService } from "./data-service";
import { GeminiService } from "./gemini.service";
import { MovieDialogService } from "./movie-dialog.service";
import { AwardsService } from "./awards.service";
import { MovieCreditPipe } from "./movie-credit.pipe";
import { ProductionCoutryPipe } from "./production-country.pipe";
import {
  DateAdapter,
  MAT_DATE_LOCALE,
  MatNativeDateModule,
  MatRippleModule,
} from "@angular/material/core";
import { CustomDateAdapter } from "./custom-date-adapter";
import {
  provideHttpClient,
  withInterceptorsFromDi,
  withFetch,
} from "@angular/common/http";
import { provideClientHydration, BrowserModule } from "@angular/platform-browser";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatIconModule } from "@angular/material/icon";
import { MatDialogModule } from "@angular/material/dialog";
import { MatMenuModule } from "@angular/material/menu";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDividerModule } from "@angular/material/divider";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatListModule } from "@angular/material/list";
import { MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { DragDropModule } from "@angular/cdk/drag-drop";
import { withInMemoryScrolling, provideRouter, Routes } from "@angular/router";
import { PollComponent } from "./poll/poll.component";
import { PollManagementComponent } from "./poll-management/poll-management.component";
import { AddPollComponent } from "./add-poll/add-poll.component";
import { AboutComponent } from "./about/about.component";
import { WatchListComponent } from "./watch-list/watch-list.component";
import { LandingComponent } from "./landing/landing.component";
import { SettingsComponent } from "./settings/settings.component";
import { ClipboardModule } from "ngx-clipboard";
import { LazyLoadImageModule } from "ng-lazyload-image";
import { MatSelectModule } from "@angular/material/select";
import { ServiceWorkerModule } from "@angular/service-worker";
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from "@angular/material/form-field";

export const APP_NAME = "poll-a-lot";

const appRoutes: Routes = [
  { path: "poll/:id", component: PollComponent },
  { path: "manage", component: PollManagementComponent },
  { path: "add-poll", component: AddPollComponent },
  { path: "about", component: AboutComponent },
  { path: "watchlist", component: WatchListComponent },
  { path: "", component: LandingComponent },
  { path: "movie/:id", component: LandingComponent },
  { path: "settings", component: SettingsComponent },
  { path: "**", redirectTo: "/", pathMatch: "full" },
  // index page --> route ** to index page
];

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(
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
      MatCheckboxModule,
      DragDropModule,
      BrowserModule,
      ClipboardModule,
      LazyLoadImageModule,
      MatFormFieldModule,
      MatSelectModule,
      ServiceWorkerModule.register("ngsw-worker.js", {
        enabled: !isDevMode(),
        // Register the ServiceWorker as soon as the application is stable
        // or after 30 seconds (whichever comes first).
        registrationStrategy: "registerWhenStable:30000",
      }),
      I18nPluralPipe
    ),
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
      // Playwright's webServer starts a fresh browser profile per run, so the debug
      // token AppCheck generates is never the same one registered in the Firebase
      // console — every real-backend call (Functions/Analytics) would 403. e2e
      // doesn't hit any AppCheck-gated backend anyway (Firestore/Auth are redirected
      // to local emulators, which don't enforce it), so just skip it entirely.
      if (environment.useEmulators) {
        return;
      }
      return initializeAppCheck(getApp(APP_NAME), {
        provider: new ReCaptchaEnterpriseProvider(
          environment.recaptcheV3SiteKey
        ),
        isTokenAutoRefreshEnabled: true,
      });
    }),
    provideFirestore(() => {
      const firestore = getFirestore(getApp(APP_NAME));
      // "e2e" build configuration only (environment.e2e.ts) — connects before any
      // request is made, so real Firestore is never touched during Playwright runs.
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, "localhost", 8080);
      }
      return firestore;
    }),
    provideFunctions(() => getFunctions(getApp(APP_NAME), "europe-west1")),
    provideAuth(() => {
      const auth = getAuth(getApp(APP_NAME));
      if (environment.useEmulators) {
        connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
      }
      return auth;
    }),
    provideAI(() => getAI(getApp(APP_NAME), { backend: new GoogleAIBackend() })),
    provideAnalytics(() => getAnalytics(getApp(APP_NAME))),
    UserService,
    NightModeService,
    TMDbService,
    LetterboxdService,
    LocalCacheService,
    LocalStorageService,
    RecentSearchesService,
    UpdateService,
    PollItemService,
    ApplicationDataService,
    GeminiService,
    MovieDialogService,
    AwardsService,
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
    provideRouter(appRoutes, withInMemoryScrolling({ scrollPositionRestoration: "disabled" })),
    // Replaces the old AppModule constructor, which injected UpdateService (for
    // its side-effecting constructor — polls for SW updates) and called
    // UserService.init() to kick off region/watch-provider/recent-poll loading.
    // Neither is otherwise injected eagerly, so without this they'd never run.
    provideAppInitializer(() => {
      inject(UpdateService);
      inject(UserService).init();
    }),
  ],
};
