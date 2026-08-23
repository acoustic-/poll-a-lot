import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';

import { SeriesPollItemComponent } from './series-poll-item.component';
import { TMDbService } from '../tmdb.service';
import { TMDbSeries } from '../../model/tmdb';

describe('SeriesPollItemComponent', () => {
  let component: SeriesPollItemComponent;
  let tmdbServiceStub: Pick<TMDbService, 'loadSeries' | 'getPosterPath'>;

  beforeEach(() => {
    tmdbServiceStub = {
      loadSeries: () => of({} as unknown as TMDbSeries),
      getPosterPath: (path: string) => path,
    };
    TestBed.configureTestingModule({
      providers: [
        SeriesPollItemComponent,
        { provide: TMDbService, useValue: tmdbServiceStub },
      ],
    });
    component = TestBed.inject(SeriesPollItemComponent);
    component.pollItem = { id: '1', pollId: 'p1', name: 'Series', created: '', voters: [], order: 0, seriesId: 42 };
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the series on init', () => {
    component.ngOnInit();
    expect(component.series$).toBeTruthy();
  });
});
