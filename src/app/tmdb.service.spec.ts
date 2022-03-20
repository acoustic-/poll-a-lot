import { TestBed, inject } from '@angular/core/testing';

import { TMDbService } from './tmdb.service';

describe('MovieService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TMDbService]
    });
  });

  it('should be created', inject([TMDbService], (service: TMDbService) => {
    expect(service).toBeTruthy();
  }));
});
