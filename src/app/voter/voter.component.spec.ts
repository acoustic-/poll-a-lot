import { PollItem } from '../../model/poll';
import { User } from '../../model/user';
import { PollItemVoter } from '../poll/poll-voters';
import { VoterComponent } from './voter.component';

function pollItem(voters: PollItem['voters'] = []): PollItem {
  return { id: 'i1', pollId: 'p1', name: 'Item', created: '1', voters, order: 0 } as PollItem;
}

describe('VoterComponent', () => {
  let component: VoterComponent;

  beforeEach(() => {
    component = new VoterComponent();
    component.pollItem = pollItem([
      { name: 'Alice', timestamp: 1 },
      { name: 'Bob', timestamp: 2 },
    ]);
  });

  describe('isVoted', () => {
    it('reflects `hasVoted` in plain (non-point) voting mode', () => {
      component.pointVoting = false;
      component.hasVoted = true;
      component.myPoints = 0;
      expect(component.isVoted).toBeTrue();
    });

    it('reflects `myPoints > 0` in point-voting mode, ignoring `hasVoted`', () => {
      component.pointVoting = true;
      component.hasVoted = true;
      component.myPoints = 0;
      expect(component.isVoted).toBeFalse();
    });

    it('is voted in point-voting mode once the voter has allocated at least one point', () => {
      component.pointVoting = true;
      component.hasVoted = false;
      component.myPoints = 1;
      expect(component.isVoted).toBeTrue();
    });
  });

  describe('clicked', () => {
    it('emits voterClicked in plain voting mode', () => {
      component.pointVoting = false;
      const spy = jasmine.createSpy('voterClicked');
      component.voterClicked.subscribe(spy);
      component.clicked();
      expect(spy).toHaveBeenCalled();
    });

    it('does not emit voterClicked in point-voting mode (the stepper handles voting instead)', () => {
      component.pointVoting = true;
      const spy = jasmine.createSpy('voterClicked');
      component.voterClicked.subscribe(spy);
      component.clicked();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('votesTotal', () => {
    it('counts voters by head in plain voting mode', () => {
      component.pointVoting = false;
      expect(component.votesTotal(component.pollItem.voters)).toBe(2);
    });

    it('sums `points` in point-voting mode', () => {
      component.pointVoting = true;
      const voters = [{ name: 'A', points: 3 }, { name: 'B', points: 2 }];
      expect(component.votesTotal(voters)).toBe(5);
    });

    it('treats a legacy voter with no `points` field as worth 0 in point-voting mode', () => {
      component.pointVoting = true;
      const voters = [{ name: 'A' }];
      expect(component.votesTotal(voters)).toBe(0);
    });

    it('returns 0 for a nullish voters array', () => {
      expect(component.votesTotal(undefined as any)).toBe(0);
    });
  });

  describe('voters$ (voter-filter narrowing)', () => {
    it('emits every voter on the poll item when no filter is selected', (done) => {
      component.voters$.subscribe((voters) => {
        expect(voters).toEqual(component.pollItem.voters as any);
        done();
      });
    });

    it('narrows to only the selected voters once a filter is applied', (done) => {
      const selectedVoters: PollItemVoter[] = [
        { name: 'Alice', selected: true },
        { name: 'Bob', selected: false },
      ];
      const emissions: any[] = [];
      component.voters$.subscribe((voters) => {
        emissions.push(voters);
        if (emissions.length === 2) {
          expect(emissions[1].map((v: any) => v.name)).toEqual(['Alice']);
          done();
        }
      });
      component.selectedVoters = selectedVoters;
    });

    it('re-emits when `pollItem` itself changes, with no [selectedVoters] ever bound', (done) => {
      // Reproduces plain/series poll items, which never bind [selectedVoters] at all
      // (see poll.component.html and series-poll-item.component.html) — voters$ must
      // still refresh when a new vote lands, purely from the pollItem input changing.
      const emissions: any[] = [];
      component.voters$.subscribe((voters) => {
        emissions.push(voters);
        if (emissions.length === 2) {
          expect(emissions[1].map((v: any) => v.name)).toEqual(['Alice', 'Bob', 'Carol']);
          done();
        }
      });
      component.pollItem = pollItem([
        { name: 'Alice', timestamp: 1 },
        { name: 'Bob', timestamp: 2 },
        { name: 'Carol', timestamp: 3 },
      ]);
    });
  });
});
