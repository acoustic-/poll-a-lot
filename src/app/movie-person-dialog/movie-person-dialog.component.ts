import { AsyncPipe, CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TMDbService } from '../tmdb.service';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, shareReplay, tap } from 'rxjs';
import { LazyLoadImageModule } from "ng-lazyload-image";
import { PosterComponent } from "../poster/poster.component";
import { openImdb } from "../movie-poll-item/movie-helpers";
import { MatChipsModule } from "@angular/material/chips";
import { DateDiffPipe } from "../date-diff.pipe";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MovieCredit, TMDbMovie } from "../../model/tmdb";
import { MatMenuModule } from "@angular/material/menu";
import { MovieDialogService } from "../movie-dialog.service";
import { FullscreenOverlayContainer, OverlayContainer, OverlayModule } from "@angular/cdk/overlay";
import { ActivatedRoute, Router } from "@angular/router";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";


export interface MoviePersonCredit {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;                      
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;            
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;

  // Person-specific fields
  character: string;
  credit_id: string;
  order: number;

  // TMDb combined credits
  media_type: 'movie' | 'tv';
}

@Component({
  selector: 'movie-person-dialog',
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatChipsModule,
    AsyncPipe,
    DateDiffPipe,
    LazyLoadImageModule,
    PosterComponent,
    MatMenuModule,
    MatFormFieldModule, 
    MatInputModule,
    OverlayModule,
    MatSnackBarModule
],
  templateUrl: './movie-person-dialog.component.html',
  styleUrl: './movie-person-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
  ]
})
export class MoviePersonDialog implements OnInit {

  NOT_SET = 'Unreleased';

  personData$: Observable<any>;
  creditCountForKnownFor$: Observable<number>;
  popularMovies$: Observable<any[]>;

  selectedCredits$: Observable<Map<string, MovieCredit[]>>;
  creditYears$ = new BehaviorSubject<string[]>([]);

  types$: Observable<Array<string> | undefined>;
  roles$: Observable<Array<string>>;

  selectedRole$ = new BehaviorSubject<string>('All');
  selectedType$ = new BehaviorSubject<string>('All');

  biographyFull = false;

  useNavigation = true;
  
  Object = Object;

  constructor(
    public dialogRef: MatDialogRef<MoviePersonDialog>,
    public dialog: MatDialog,
    private tmdbService: TMDbService,
    private movieDialogService: MovieDialogService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA)
    public data: {personId: string}
  ) {

  
  }
  ngOnInit() {
    const personId = this.data.personId;

    this.personData$ = this.tmdbService.loadMovieCredits(personId).pipe(distinctUntilChanged(), shareReplay(1));
    this.creditCountForKnownFor$ = this.personData$.pipe(
      map(person => {
        const credits = person.movie_credits || person.combined_credits;
        const knownFor = person.known_for_department;
        if (knownFor === 'Acting') {
          return credits.cast.length;
        }
        return credits.crew.filter(credit => credit.department === person.known_for_department).length;
      })
    );

    this.popularMovies$ = this.personData$.pipe(
      map(person => [person.known_for_department,person.movie_credits || person.combined_credits]),
      map(([knownForDepartment, credits]) => {
        let knownForCredits: MovieCredit[] = [];
        if (knownForDepartment === 'Acting') {
          knownForCredits = credits.cast;

          // log(vote_count) * roleMultiplier(order / job) + popularity
          const roleMultiplier = (order: number) => {
            return Math.max(0, 1 - order * 0.1);
          };
          
          const score = (credit: MovieCredit) => {
            return Math.log10(credit.vote_count + 1) * roleMultiplier((credit as any).order) + credit.popularity * 0.01;
          };
          return knownForCredits.sort((a,b) => score(b) - score(a));
        } else {
          knownForCredits = credits.crew.filter(credit => credit.department === knownForDepartment);
          return knownForCredits.sort((a,b) => a.vote_count < b.vote_count ? 1 : a.vote_count > b.vote_count ? -1 : 0);
        }

      }),
    );

    this.roles$ = this.personData$.pipe(
      map(person => person.movie_credits || person.combined_credits),
      map(credits => {
        const roles = new Set<string>;
        if (credits.cast.length) {
          roles.add('Acting');
        }
        if (credits.crew.length) {
          credits.crew.forEach(credit => {
            roles.add(`${credit.department} / ${credit.job}`);
          });
        };
        return (Array.from(roles.keys())).sort();
      })
    )

    this.types$ = this.personData$.pipe(
      map(person => person.combined_credits ? ['All', 'tv', 'movie'] : undefined), 
    );

    this.selectedCredits$ = combineLatest([
      this.personData$,
      this.selectedRole$,
      this.selectedType$,
    ]).pipe(
      map(([data, role, type]) => {
        const movieCreditsByYear = new Map<string, MovieCredit[]>;

        const credits = (data.combined_credits || data.movie_credits);

        let selectedCredits = [];

        if (role === 'All') {
          selectedCredits = [...credits.cast, ...credits.crew];
        }
        else if (role === 'Acting') {
          selectedCredits = credits.cast;
        } else {
          selectedCredits = credits.crew.filter(crew => crew.job === role);
        }

        if (type !== 'All') {
          selectedCredits = selectedCredits.filter(credit => credit.media_type === type);
        }

        const getReleaseDate = (credit) => credit.release_date || credit.first_credit_air_date || this.NOT_SET;
        
        const sortedCredits = selectedCredits.sort((a,b) => {
          const dateStrA = getReleaseDate(a);
          const dateStrB = getReleaseDate(b);

          // Set "Unreleased" as the beginning
          if (dateStrA === this.NOT_SET || dateStrB === this.NOT_SET) {
            return dateStrA === this.NOT_SET && dateStrB !== this.NOT_SET ? -1 : dateStrA !== this.NOT_SET && dateStrB === this.NOT_SET ? 1 : 0;
          }
    
          const dateA = new Date(dateStrA).valueOf();
          const dateB = new Date(dateStrB).valueOf();
          return dateA < dateB ? 1 : dateA > dateB ? -1 : 0;
        });

        for (let credit of sortedCredits) {
          const year = getReleaseDate(credit).split('-')[0];
          movieCreditsByYear.set(year, [...(movieCreditsByYear.get(year) || []), credit]);
        }
        this.creditYears$.next(Array.from(movieCreditsByYear.keys()));

        return movieCreditsByYear;
      }),
    )
  }

  selectType(type: string) {
    this.selectedType$.next(type);
  }

  selectRole(input: string) {
    const [department, role] = input.split(' / ');
    this.selectedRole$.next(role ? role : department);
  }

  openImdb(imdbId: string) {
    openImdb(imdbId, 'name');
  }

  openMovie(movie: TMDbMovie) {
    this.movieDialogService.openMovie({
      isVoteable: false,
      editable: false,
      movieId: movie.id,
      addMovie: false,
      landing: false,
      showRecentPollAdder: true,
      useNavigation: true
    });
  }

  openSeries(series: TMDbMovie) {
    this.snackBar.open("TV series view is not yet implemented. Coming soon! 📺", undefined, { duration: 5000 });
  }

  close() {
    this.dialogRef.close();
  }

  closeAllModals() {
    this.dialog.closeAll();
  }

  ngAfterViewInit() {
    if (this.useNavigation !== false) {

      setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { person: String(this.data.personId) },
          queryParamsHandling: "merge",
        });
      });
    }
  }

  ngOnDestroy() {
    if (
      this.useNavigation !== false
    ) {
      setTimeout(() => {
        const parentPersonId = this.dialog.openDialogs.reverse().find(dialog => dialog.componentInstance?.data?.personId)?.componentInstance.data.personId;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            person: parentPersonId,
          },
          queryParamsHandling: "merge",
        });
      });
    }
  }
}
