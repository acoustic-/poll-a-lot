import { TestBed, waitForAsync } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { UserService } from './user.service';
import { NightModeService } from './night-mode-service.service';

// AppComponent's imports (HeaderComponent, FooterComponent) are real standalone
// components since the standalone migration, so they're actually instantiated
// here (not just left as inert unknown elements under NO_ERRORS_SCHEMA) —
// their dependencies need stubs too, not just AppComponent's own.
describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
        provideRouter([]),
        {
            provide: UserService,
            useValue: {
                openWelcomeDialogIfFirstVisit: jasmine.createSpy('openWelcomeDialogIfFirstVisit'),
                user$: of(undefined),
            },
        },
        {
            provide: NightModeService,
            useValue: { night$: of({ state: false }) },
        },
        { provide: MatDialog, useValue: {} },
    ],
    schemas: [NO_ERRORS_SCHEMA],
}).compileComponents();
  }));
  it('should create the app', waitForAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  }));
  it('should render its layout shell', waitForAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.debugElement.nativeElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  }));
});
