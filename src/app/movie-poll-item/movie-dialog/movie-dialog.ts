import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  OnInit,
  OnDestroy,
  Output,
  ViewChild,
  AfterViewInit,
} from "@angular/core";
import {
  Movie,
  MoviePollItemData,
  TMDbMovie,
  WatchProviders,
  WatchService,
} from "../../../model/tmdb";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MatExpansionModule,
  MatExpansionPanel,
} from "@angular/material/expansion";
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from "@angular/material/dialog";
import { MatMenuModule } from "@angular/material/menu";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatChipsModule } from "@angular/material/chips";
import { AsyncPipe, CommonModule, DatePipe, DecimalPipe } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { BehaviorSubject, Observable, NEVER } from "rxjs";
import {
  openImdb,
  openTmdb,
  openLetterboxd,
  SEEN,
  getSimpleMovieTitle,
} from "../movie-helpers";
import { User } from "../../../model/user";
import { TMDbService } from "../../tmdb.service";
import { distinctUntilChanged, filter, first, map, switchMap, takeUntil, tap } from "rxjs/operators";

import { LazyLoadImageModule } from "ng-lazyload-image";
import { CountryFlagNamePipe } from "../../country-name-flag.pipe";
import { MetaColorPipe } from "../../meta-bg-color.pipe";
import { MovieCreditPipe } from "../../movie-credit.pipe";
import { ProductionCoutryPipe } from "../../production-country.pipe";

import { MatSelectModule } from "@angular/material/select";
import { VotersPipe } from "../../voters.pipe";
import { UserService } from "../../user.service";
import { PollItemService } from "../../poll-item.service";
import { HyphenatePipe } from "../../hyphen.pipe";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { ScrollPreserverDirective } from "../../scroll-preserver.directive";
import { defaultDialogOptions, defaultDialogHeight } from "../../common";
import { PosterComponent } from "../../poster/poster.component";
import {
  MatBottomSheet,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet";
import { GeminiService } from "../../gemini.service";
import {
  PollDescriptionData,
  PollDescriptionSheet,
} from "../../../app/poll/poll-description-dialog/poll-description-dialog";
import { PollLinkCopyComponent } from "../../poll-link-copy/poll-link-copy.component";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { isDefined } from "../../helpers";
import { Analytics, logEvent } from "@angular/fire/analytics";
import { ActivatedRoute, Router } from "@angular/router";
import { MovieDialogData } from "../../../model/movie-dialog";
import { MatTooltip } from "@angular/material/tooltip";
import { FullscreenOverlayContainer, OverlayContainer, OverlayModule } from "@angular/cdk/overlay";
import { ButtonGradientComponent } from "../../shared/button-gradient/button-gradient.component";
import { SwiperDirective } from "../../swiper.directive";
import { MoviePersonDialog } from "../../movie-person-dialog/movie-person-dialog.component";
import { DddInfoComponent } from "../ddd-info/ddd-info.component";
import { MovieCollectionComponent } from "../movie-collection/movie-collection.component";
import { MovieAwardsComponent } from "../movie-awards/movie-awards.component";
import { AwardsService } from "../../awards.service";
import ColorThief from "colorthief";

@Component({
  selector: "movie-dialog",
  templateUrl: "movie-dialog.html",
  styleUrls: ["./movie-dialog.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    DatePipe,
    DecimalPipe,
    MatIconModule,
    AsyncPipe,
    MatExpansionModule,
    LazyLoadImageModule,
    CountryFlagNamePipe,
    MetaColorPipe,
    MovieCreditPipe,
    ProductionCoutryPipe,
    MatSelectModule,
    VotersPipe,
    MatMenuModule,
    HyphenatePipe,
    ScrollPreserverDirective,
    SwiperDirective,
    PosterComponent,
    MatChipsModule,
    MatBottomSheetModule,
    PollLinkCopyComponent,
    MatSnackBarModule,
    MatTooltip,
    OverlayModule,
    ButtonGradientComponent,
    DddInfoComponent,
    MovieCollectionComponent,
    MovieAwardsComponent
  ],
  providers: [
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
  ]
})
export class MovieDialog implements OnInit, AfterViewInit, OnDestroy {
  @Output() voteClicked = new EventEmitter();
  @Output() updateDescription = new EventEmitter<string>();
  @Output() reactionClicked = new EventEmitter<string>();
  @Output() addMovie = new EventEmitter<TMDbMovie | undefined>();

  @ViewChild("overview") overviewEl: ElementRef;
  @ViewChild(ScrollPreserverDirective) scrollPreserve: ScrollPreserverDirective;
  @ViewChild("availablePanel") availableListEl: MatExpansionPanel;
  @ViewChild("movieAwards") movieAwardsElement: ElementRef;
  @ViewChild("movieAwardsComponent") movieAwardsComponent: MovieAwardsComponent;

  // @HostBinding('style.--mat-dialog-container-color') backgroundColor: string = '';

  user$: Observable<User | undefined>;
  editDescription: string | undefined;

  backdrop$ = new BehaviorSubject<string | undefined>(undefined);
  backdropLoaded$ = new BehaviorSubject<boolean>(false);

  watchProviders$: Observable<WatchProviders>;
  selectedWatchProviderCountry = "FI";

  availableShort$: Observable<
    { title: string; provider: WatchService } | undefined
  >;
  availableShortColor$: Observable<{ primary: string, secondary: string }>;

  maxBgCount = 15;

  movie$ = new BehaviorSubject<
    Movie | TMDbMovie | MoviePollItemData | undefined
  >(undefined);

  certification$: Observable<string | undefined>;

  bgColor$ = new BehaviorSubject<string | undefined>(undefined);
  complementaryBgColor$ = new BehaviorSubject<string | undefined>(undefined);
  textColor$ = new BehaviorSubject<string>('#46464f');

  openImdb = openImdb;
  openTmdb = openTmdb;
  openLetterboxd = openLetterboxd;

  selectedBackdrop$ = new BehaviorSubject<number>(0);
  recentPolls$: Observable<{ id: string; name: string }[]>;

  letterboxdCrew$ = new BehaviorSubject<undefined | {}>(undefined);
  trailerUrl$ = new BehaviorSubject<undefined | SafeResourceUrl[]>(undefined);

  openStories$ = new BehaviorSubject<string[]>([]);

  hasOscarAwards$: Observable<'won' | 'nominated' | 'none'>;

  topOfStackClass = "top-of-stack";
  midStackClass = "mid-of-stack";
  isDefined = isDefined;

  bgFullscreen = false;
  showTrailerFullscreen = false;

  subs = NEVER.subscribe();

  constructor(
    public dialogRef: MatDialogRef<MovieDialog>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private pollItemService: PollItemService,
    private userService: UserService,
    private geminiService: GeminiService,
    private awardsService: AwardsService,
    private cd: ChangeDetectorRef,
    public domSanitizer: DomSanitizer,
    private bottomSheet: MatBottomSheet,
    private snackBar: MatSnackBar,
    private analytics: Analytics,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(MAT_DIALOG_DATA)
    public data: MovieDialogData
  ) {
    this.recentPolls$ = this.userService
      .getUserData$()
      .pipe(map((data) => data?.latestPolls));

    this.availableShort$ = this.movie$.pipe(
      filter((movie: Movie) => !!movie?.watchProviders),
      map((movie: Movie) => movie.watchProviders),
      map((result) => {
        let show;
        let title;

        const flatrate =
          result.results[this.selectedWatchProviderCountry]?.flatrate;
        const free = result.results[this.selectedWatchProviderCountry]?.free;
        const rent = result.results[this.selectedWatchProviderCountry]?.rent;
        const buy = result.results[this.selectedWatchProviderCountry]?.buy;
        const ads = result.results[this.selectedWatchProviderCountry]?.ads;

        if (free) {
          title = "Streaming now";
          show = free[0];
        } else if (flatrate) {
          title = "Streaming now";
          show = flatrate[0];
        } else if (ads) {
          title = "Streaming (ads)";
          show = ads[0];
        } else if (rent) {
          title = "Available";
          show = rent[0];
        } else if (buy) {
          title = "Available";
          show = buy[0];
        } else {
          show = undefined;
        }
        return show ? { title, provider: show } : undefined;
      })
    );

    this.availableShortColor$ = this.availableShort$.pipe(
      filter(isDefined),
      map(available => 'https://image.tmdb.org/t/p/' + 'w154/' + available.provider.logo_path),
      switchMap(async url => await this.getAvailableImageColor(url)),
      map((color => ({ primary: `rgb(${color.join(',')})`, secondary: this.getContrastColor(...color) })))
    );
  }

  ngOnInit() {
    if (this.data.movie) {
      this.movie$.next(this.data.movie);
    }

    if (this.data.outputs) {
      this.addMovie = this.data.outputs.addMovie;
    }

    if (this.data.previouslyOpenedDialog) {
      setTimeout(() => this.data.previouslyOpenedDialog?.close(), 100);
    }

    this.setBackdrop((this.data.movie as MoviePollItemData)?.backdropPath);

    this.initMovie(this.data.movie?.id || this.data.movieId);

    this.subs.add(
      this.selectedBackdrop$.subscribe((i) => {
        const movie = this.movie$.getValue() as Movie;
        this.setBackdrop(
          movie?.originalObject?.images?.backdrops[i]?.file_path || movie?.backdropPath || (movie as any)?.backdrop_path
        );
        setTimeout(() => {
          this.cd.detectChanges();
        }, 100);
      })
    );

    this.user$ = this.userService.user$;

    if (this.data?.landing) {
      this.movie$.pipe(first(), filter(isDefined)).subscribe((movie) =>
        logEvent(this.analytics, "movie_open", {
          source: "landing_page",
          movieId: movie.id,
        })
      );
    }

    this.hasOscarAwards$ = this.movie$.pipe(
      map(movie => movie?.id),
      filter(isDefined),
      map(movieId => {
        const awards = this.awardsService.getOscarAwardsForMovie(movieId);
        const wonAwards = awards.filter(a => a.won).length;
        return wonAwards > 0 ? 'won' : awards.length > 0 ? 'nominated' : 'none';
      })
    );

    this.movie$.pipe(
      filter(isDefined),
      map(movie => (movie as Movie)?.backdropPath),
      filter(isDefined),
      distinctUntilChanged())
      .subscribe(async backdropPath => {
        const bgColor = await this.setImageColor('https://image.tmdb.org/t/p/w300' + backdropPath);
        this.textColor$.next(this.getContrastColor(...bgColor));
        this.cd.detectChanges();
      });

    this.certification$ = this.movie$.pipe(
      map((movie) => (movie as Movie)?.originalObject?.release_dates?.results),
      filter(isDefined),
      switchMap(releaseDates => this.userService.getUserData$().pipe(
        map(user => user?.region || 'US'),
        map(userRegion => releaseDates.find(region => region.iso_3166_1 === (userRegion))?.release_dates[0]?.certification),
      ))
    );
  }

  ngAfterViewInit() {
    if (this.data.useNavigation !== false) {

      setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { movieId: String(this.data.movieId) },
          queryParamsHandling: "merge",
        });
      });
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();

    if (
      this.data.useNavigation !== false
    ) {
      setTimeout(() => {
        const parentMovieId = this.dialog.openDialogs.reverse().find(dialog => dialog.componentInstance?.data?.movieId)?.componentInstance.data.movieId;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            movieId: parentMovieId,
          },
          queryParamsHandling: "merge",
        });
      });
    }
  }

  onStateChangeBackdropLoaded(event: { reason: string; }) {
    if (event.reason === "finally") {
      setTimeout(() => {
        this.backdropLoaded$.next(true);
        this.cd.detectChanges();
      });
    }
  }

  initMovie(movieId: number) {
    if (movieId) {
      const movieObs$ = this.tmdbService.loadCombinedMovie(movieId, false).pipe(
        map((movie) => {
          const filteredRecommendations = movie.recommendations.results.filter(
            (result) => !(this.data.filterMovies || []).includes(result.id)
          );
          return {
            ...movie,
            recommendations: {
              ...movie.recommendations,
              results: filteredRecommendations,
            },
          };
        }),
        tap((movie) => this.setMovie(movie)),
        tap((movie) => this.movie$.next(movie)),
      );
      this.subs.add(movieObs$.subscribe());
    }
  }

  setMovie(movie: Movie) {
    this.movie$.next(movie);
    const letterboxdItem = (movie as Movie)?.letterboxdItem;
    if (letterboxdItem) {
      this.letterboxdCrew$.next(
        letterboxdItem.contributions.filter((c) => c.type !== "Actor")
      );
      const id = letterboxdItem.trailer?.url.split("?v=")[1];
      const embedUrl = `https://www.youtube.com/embed/${id}`;

      this.trailerUrl$.next([
        this.domSanitizer.bypassSecurityTrustResourceUrl(embedUrl),
        this.domSanitizer.bypassSecurityTrustResourceUrl(`${embedUrl}?autoplay=1`)
      ]);
    }

    // Set trailer URL
    if (movie?.originalObject?.videos?.results?.length) {
      const trailer = movie.originalObject.videos.results.find(
        (video) => video.type === "Trailer"
      );
      if (trailer) {
        const embedUrl = `https://www.youtube.com/embed/${trailer.key}`;
        this.trailerUrl$.next([
          this.domSanitizer.bypassSecurityTrustResourceUrl(embedUrl),
          this.domSanitizer.bypassSecurityTrustResourceUrl(`${embedUrl}?autoplay=1`)
        ]);
      }
    }

    this.selectedBackdrop$.next(0);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  descriptionButtonClick(): void {
    if (this.editDescription) {
      this.updateDescription.emit(this.editDescription);
      this.editDescription = undefined;
    } else if (this.editDescription === "") {
      this.editDescription = undefined;
    } else {
      this.editDescription = this.data.description || "";
    }
  }

  clickReaction(reaction: string) {
    this.reactionClicked.emit(reaction);
  }

  voteButtonClick(): void {
    this.voteClicked.emit("click");
  }

  translateReactionLabel(input: string): string {
    switch (input) {
      case SEEN:
        return "Seen it";
      case "favorite":
        return "Love it";
      default:
        return "Not this!";
    }
  }

  openAnotherMovie(movie: TMDbMovie) {
    if (this.data.currentMovieOpen === false) {
      this.dialogRef.close();
    }
    const openedMovieDialog = this.dialog.open(MovieDialog, {
      ...defaultDialogOptions,
      height: defaultDialogHeight,
      data: {
        movie,
        isVoteable: false,
        editable: false,
        movieId: movie.id,
        addMovie: this.data.locked ? false : true,
        currentMovieOpen: true,
        parentStr: this.data.parentStr,
        filterMovies: this.data.filterMovies,
        previouslyOpenedDialog:
          this.data.parent !== true ? this.dialogRef : undefined,
        outputs: {
          addMovie: this.addMovie,
        },
        locked: this.data.locked,
        parentMovieId: this.data.movieId,
      },
      panelClass: this.topOfStackClass,
      hasBackdrop: false,
    });

    openedMovieDialog.componentInstance.addMovie
      .pipe(takeUntil(openedMovieDialog.afterClosed()))
      .subscribe((movie) => {
        this.addMovie.emit(movie);
      });
    openedMovieDialog
      .afterClosed()
      .subscribe(
        this.dialogRef.componentInstance.overviewEl.nativeElement.scrollIntoView()
      );
  }

  getWatchProviderCountries(watchProviders: WatchProviders): string[] {
    return Object.keys(watchProviders.results);
  }

  clickAddMovie(movie: TMDbMovie) {
    this.addMovie.emit(movie);
    this.dialogRef.close();
  }

  closeDialog() {
    this.dialogRef.close();
  }

  onSwipeLeft() {
    console.log("swipe left");

    const current = this.selectedBackdrop$.getValue();
    const movie = this.movie$.getValue() as Movie;
    const total =
      movie.originalObject.images.backdrops.slice(0, this.maxBgCount).length -
      1;
    if (current < total) {
      this.selectedBackdrop$.next(current + 1);
    }
  }

  onSwipeRight() {
    console.log("swipe right");

    const current = this.selectedBackdrop$.getValue();
    if (current > 0) {
      this.selectedBackdrop$.next(current - 1);
    }
  }

  openAvailable() {
    this.availableListEl?.open();
    setTimeout(
      () => this.availableListEl?._body.nativeElement.scrollIntoView(),
      200
    );
  }

  async addOptionToPoll(pollId: string) {
    (
      await this.pollItemService.addMoviePollItem(
        this.movie$.getValue() as Movie,
        pollId,
        undefined,
        false,
        true
      )
    ).subscribe();
  }

  toggleStory(id: string) {
    if (this.openStories$.getValue().includes(id)) {
      this.openStories$.next(
        this.openStories$.getValue().filter((i) => i !== id)
      );
    } else {
      this.scrollPreserve.prepareFor("up");
      this.openStories$.next([...this.openStories$.getValue(), id]);
      setTimeout(() => this.scrollPreserve.restore());
    }
  }

  async suggestMovie(user: User | undefined, movie: Movie) {
    if (!user?.id) {
      const snack = this.snackBar.open(
        "Login with Google to view suggestions",
        "Login",
        { duration: 5000 }
      );
      snack
        .onAction()
        .pipe(takeUntil(snack.afterDismissed()))
        .subscribe(() => this.userService.openLoginDialog());
      return;
    }

    let suggestion: string;

    this.bottomSheet.open(PollDescriptionSheet, {
      data: { description: undefined, simple: true } as Partial<PollDescriptionData>,
    });

    if (this.data.pollItem?.suggestionAI) {
      suggestion = this.data.pollItem.suggestionAI.text;
    } else {
      suggestion = await this.geminiService.generateVoteSuggestionDescription(
        undefined,
        getSimpleMovieTitle(movie)
      );

      if (this.data?.pollItem?.pollId) {
        this.pollItemService.saveSuggestion(
          this.data.pollItem.pollId,
          this.data.pollItem,
          suggestion,
          null
        );
      }
    }

    this.bottomSheet._openedBottomSheetRef.instance.data.description =
      suggestion;
  }

  loginClick() {
    this.userService.openLoginDialog();
  }

  selectPerson(personId: string) {
    const ref = this.dialog.open(MoviePersonDialog, {
      ...defaultDialogOptions,
      hasBackdrop: false,
      height: defaultDialogHeight,
      data: {
        personId
      },
    });
  }

  closeAllModals() {
    this.dialog.closeAll();
  }

  openAwardsSection() {
    this.movieAwardsElement.nativeElement.scrollIntoView({ behavior: 'smooth' });
    this.movieAwardsComponent.open = true;
  }

  private setBackdrop(current: string | undefined) {
    if (current) {
      this.backdrop$.next(current);
    }
  }

  private urlify(text: string) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(
      urlRegex,
      (url) =>
        `<span class="with-launch-icon"><a class="outside-link" target="_blank" href="${url}">${url}</a></span>`
    );
  }

  private rgbToHsl([r, g, b]: number[]) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }

      h *= 60;
    }

    return { h, s, l };
  }

  private hslDistance(a: any, b: any): number {
    const dh = Math.min(
      Math.abs(a.h - b.h),
      360 - Math.abs(a.h - b.h)
    ) / 180;

    const ds = Math.abs(a.s - b.s);
    const dl = Math.abs(a.l - b.l);

    return dh * 2 + ds + dl * 2;
  }

  private findBestContrast(
    bgRgb: number[],
    palette: number[][]
  ) {
    const bgHsl = this.rgbToHsl(bgRgb);

    return palette
      .map(rgb => ({ rgb, hsl: this.rgbToHsl(rgb) }))
      .sort(
        (a, b) =>
          this.hslDistance(b.hsl, bgHsl) -
          this.hslDistance(a.hsl, bgHsl)
      )[0].rgb;
  }

  private async setImageColor(url: string): Promise<[number, number, number]> {
    // 1. Fetch the image and create a local URL
    const response = await fetch(url);
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);

    // 2. Wrap the image loading in a Promise
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = async () => {
        const colorThief = new ColorThief();
        const color = colorThief.getColor(img);
        const palette = colorThief.getPalette(img);
        const complementaryColor = this.findBestContrast(color, palette);

        this.bgColor$.next(`rgb(${color.join(',')})`);
        this.complementaryBgColor$.next((`rgb(${complementaryColor.join(',')})`));

        // Cleanup: release memory and return value
        URL.revokeObjectURL(objectURL);
        resolve(color);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectURL);
        reject(new Error("Failed to load image for color extraction"));
      };

      img.src = objectURL;
    });
  }

  private async getAvailableImageColor(url: string): Promise<[number, number, number]> {
    // 1. Fetch the image and create a local URL
    const response = await fetch(url);
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);

    // 2. Wrap the image loading in a Promise
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = async () => {
        const colorThief = new ColorThief();
        const color = colorThief.getColor(img);
        // Cleanup: release memory and return value
        URL.revokeObjectURL(objectURL);
        resolve(color);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectURL);
        reject(new Error("Failed to load image for color extraction"));
      };

      img.src = objectURL;
    });
  }

  private getContrastColor(r: number, g: number, b: number): string {
    // 1. Normalize and apply Gamma Correction
    const [lr, lg, lb] = [r, g, b].map((val) => {
      val /= 255;
      return val <= 0.03928
        ? val / 12.92
        : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    // 2. Calculate relative luminance
    const luminance = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;

    // 3. Return contrast based on threshold
    return luminance > 0.179 ? '#46464f' : 'whitesmoke';
  }
}
