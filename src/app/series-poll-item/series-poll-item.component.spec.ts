import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MoviePollItemComponent } from './movie-poll-item.component';

describe('MoviePollItemComponent', () => {
  let component: MoviePollItemComponent;
  let fixture: ComponentFixture<MoviePollItemComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MoviePollItemComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MoviePollItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
