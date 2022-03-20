import { TestBed, inject } from '@angular/core/testing';

import { LocalCacheService } from './local-cache.service';

describe('LocalCacheService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LocalCacheService]
    });
  });

  it('should be created', inject([LocalCacheService], (service: LocalCacheService) => {
    expect(service).toBeTruthy();
  }));
});
