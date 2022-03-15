import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { PollOptionDialogComponent } from './poll-option-dialog.component';

describe('PollOptionDialogComponent', () => {
  let component: PollOptionDialogComponent;
  let fixture: ComponentFixture<PollOptionDialogComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ PollOptionDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PollOptionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
