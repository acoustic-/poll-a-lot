import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PollOptionDialogComponent } from './poll-option-dialog.component';

describe('PollOptionDialogComponent', () => {
  let component: PollOptionDialogComponent;
  let fixture: ComponentFixture<PollOptionDialogComponent>;

  beforeEach(async(() => {
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
