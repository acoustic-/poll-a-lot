import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AddPollComponent } from './add-poll.component';

describe('AddPollComponent', () => {
  let component: AddPollComponent;
  let fixture: ComponentFixture<AddPollComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ AddPollComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AddPollComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
