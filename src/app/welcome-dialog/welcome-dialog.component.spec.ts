import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { WelcomeDialogComponent } from './welcome-dialog.component';

describe('WelcomeDialogComponent', () => {
  let fixture: ComponentFixture<WelcomeDialogComponent>;
  let component: WelcomeDialogComponent;
  let userServiceStub: { login: jasmine.Spy };

  beforeEach(() => {
    userServiceStub = { login: jasmine.createSpy('login') };

    TestBed.configureTestingModule({
      imports: [WelcomeDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { userService: userServiceStub } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
      ],
    });

    fixture = TestBed.createComponent(WelcomeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the four-item feature list', () => {
    const items = fixture.nativeElement.querySelectorAll('.feature-list li');
    expect(items.length).toBe(4);
  });

  it('renders the corrected short-form fine print, not the old inaccurate claim', () => {
    const fineprint = fixture.nativeElement.querySelector('.fine-print').textContent;
    expect(fineprint).toContain('first name and photo are shown to other voters by default');
    expect(fineprint).not.toContain('only your');
  });

  it('login() delegates to the injected UserService', () => {
    component.login();
    expect(userServiceStub.login).toHaveBeenCalled();
  });

  it('clicking the login-button triggers login()', () => {
    spyOn(component, 'login');
    const loginButton: HTMLButtonElement = fixture.nativeElement.querySelector('login-button button');
    loginButton.click();
    expect(component.login).toHaveBeenCalled();
  });

  it('renders the skip button with the confirmed popcorn copy', () => {
    const skipButton = fixture.nativeElement.querySelector('[data-testid="welcome-skip"]');
    expect(skipButton).toBeTruthy();
    expect(skipButton.textContent).toContain('Just here for the popcorn');
  });
});
