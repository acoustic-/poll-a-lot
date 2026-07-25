import { ShareDialogComponent } from './share-dialog.component';
import { PollItemService } from '../poll-item.service';

describe('ShareDialogComponent', () => {
  let component: ShareDialogComponent;
  let pollItemServiceStub: Pick<PollItemService, 'getPollUrl'>;

  beforeEach(() => {
    pollItemServiceStub = {
      getPollUrl: (pollId: string) => `https://poll-a-lot.web.app/poll/${pollId}`,
    };
    component = new ShareDialogComponent(
      { close: () => {} } as any,
      { id: 'poll-1', name: 'Movie night' },
      pollItemServiceStub as PollItemService
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reads the poll id from the injected dialog data', () => {
    expect(component.pollId).toBe('poll-1');
  });
});
