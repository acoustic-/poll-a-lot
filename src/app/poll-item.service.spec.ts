import { PollItem } from '../model/poll';
import { User } from '../model/user';
import { UserService } from './user.service';
import { PollItemService, canAddPoint, canRemovePoint } from './poll-item.service';

function pollItem(overrides: Partial<PollItem> = {}): PollItem {
  return {
    id: overrides.id ?? 'item-1',
    pollId: 'poll-1',
    name: 'Item',
    created: '100',
    voters: [],
    order: 0,
    ...overrides,
  } as PollItem;
}

describe('canAddPoint / canRemovePoint (ranked point-budget voting math)', () => {
  describe('canAddPoint', () => {
    it('allows adding a point when budget remains and no per-item cap applies', () => {
      expect(canAddPoint(2, 0)).toBeTrue();
    });

    it('blocks adding a point once the budget is fully spent', () => {
      expect(canAddPoint(0, 0)).toBeFalse();
    });

    it('blocks adding a point once the per-item cap is reached', () => {
      expect(canAddPoint(5, 2, 2)).toBeFalse();
    });

    it('allows adding a point below the per-item cap', () => {
      expect(canAddPoint(5, 1, 2)).toBeTrue();
    });

    it('treats a `null` maxPerItem as unlimited, same as `undefined`', () => {
      expect(canAddPoint(5, 100, null)).toBeTrue();
      expect(canAddPoint(5, 100, undefined)).toBeTrue();
    });

    it('treats a `maxPerItem` of exactly 0 as an active (impossible) cap, not unlimited', () => {
      // maxPerItem == null is the "unlimited" sentinel; 0 is a real, if degenerate, cap.
      expect(canAddPoint(5, 0, 0)).toBeFalse();
    });
  });

  describe('canRemovePoint', () => {
    it('allows removing a point when the voter currently has at least one', () => {
      expect(canRemovePoint(1)).toBeTrue();
    });

    it('blocks removing a point when the voter has none', () => {
      expect(canRemovePoint(0)).toBeFalse();
    });
  });
});

describe('PollItemService ranked-voting bookkeeping', () => {
  let service: PollItemService;
  let userServiceStub: Pick<UserService, 'getUser' | 'getUserOrOpenLogin' | 'usersAreEqual'>;
  let currentUser: User | undefined;
  let snackBarOpenSpy: jasmine.Spy;

  beforeEach(() => {
    currentUser = { id: 'u1', name: 'Alice' };
    userServiceStub = {
      getUser: () => currentUser,
      getUserOrOpenLogin: () => currentUser,
      usersAreEqual: (a, b) => !!a && !!b && (a.id && b.id ? a.id === b.id : a.name === b.name && a.localUserId === b.localUserId),
    };
    snackBarOpenSpy = jasmine.createSpy('open');
    service = new PollItemService(
      userServiceStub as UserService,
      { open: snackBarOpenSpy } as any,
      {} as any,
      {} as any,
      document,
      {} as any
    );
  });

  describe('hasVoted', () => {
    it('is false when the poll item has no voters', () => {
      expect(service.hasVoted(pollItem())).toBeFalse();
    });

    it('is true when the current user is among the voters', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.hasVoted(item)).toBeTrue();
    });

    it('is false when there is no current user to check against', () => {
      currentUser = undefined;
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.hasVoted(item)).toBeFalse();
    });
  });

  describe('getUserPoints', () => {
    it('returns 0 when the user has not voted on this item', () => {
      expect(service.getUserPoints(pollItem(), currentUser)).toBe(0);
    });

    it('returns the stored points for this user\'s voters[] entry', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 3 }] });
      expect(service.getUserPoints(item, currentUser)).toBe(3);
    });

    it('returns 0 for a legacy voters[] entry that predates ranked voting (no `points` field)', () => {
      const item = pollItem({ voters: [{ id: 'u1', name: 'Alice', timestamp: 1 }] });
      expect(service.getUserPoints(item, currentUser)).toBe(0);
    });
  });

  describe('getUsedBudget', () => {
    it('sums this user\'s points across every poll item', () => {
      const items = [
        pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 2 }] }),
        pollItem({ id: 'b', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 3 }] }),
        pollItem({ id: 'c', voters: [{ id: 'u2', name: 'Bob', timestamp: 1, points: 5 }] }),
      ];
      expect(service.getUsedBudget(items, currentUser)).toBe(5);
    });

    it('returns 0 for an empty poll', () => {
      expect(service.getUsedBudget([], currentUser)).toBe(0);
    });
  });

  describe('allocatePoint guard clauses (no Firestore write reached)', () => {
    it('shows a snack and does not throw when the budget is already fully spent', async () => {
      const items = [pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 5 }] })];
      await service.allocatePoint('poll-1', items[0], items, 5, undefined, 1);
      expect(snackBarOpenSpy).toHaveBeenCalled();
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain('used all 5');
    });

    it('shows a snack and stops when adding would exceed the per-item cap', async () => {
      const item = pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 2 }] });
      await service.allocatePoint('poll-1', item, [item], 10, 2, 1);
      expect(snackBarOpenSpy).toHaveBeenCalled();
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain("can't put more than 2 points");
    });

    it('singularizes the per-item cap message when the cap is 1', async () => {
      const item = pollItem({ id: 'a', voters: [{ id: 'u1', name: 'Alice', timestamp: 1, points: 1 }] });
      await service.allocatePoint('poll-1', item, [item], 10, 1, 1);
      expect(snackBarOpenSpy.calls.mostRecent().args[0]).toContain("can't put more than 1 point on");
    });

    it('silently no-ops removing a point the user does not have', async () => {
      const item = pollItem({ id: 'a', voters: [] });
      await service.allocatePoint('poll-1', item, [item], 5, undefined, -1);
      expect(snackBarOpenSpy).not.toHaveBeenCalled();
    });
  });
});
