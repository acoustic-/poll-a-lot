import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ShareDialogComponent } from './share-dialog.component';
import { PollItemService } from '../poll-item.service';

describe('ShareDialogComponent', () => {
  let component: ShareDialogComponent;
  let pollItemServiceStub: Pick<PollItemService, 'getPollUrl'>;

  beforeEach(() => {
    pollItemServiceStub = {
      getPollUrl: (pollId: string) => `https://poll-a-lot.web.app/poll/${pollId}`,
    };
    TestBed.configureTestingModule({
      providers: [
        ShareDialogComponent,
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { id: 'poll-1', name: 'Movie night' } },
        { provide: PollItemService, useValue: pollItemServiceStub },
      ],
    });
    component = TestBed.inject(ShareDialogComponent);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reads the poll id from the injected dialog data', () => {
    expect(component.pollId).toBe('poll-1');
  });
});
