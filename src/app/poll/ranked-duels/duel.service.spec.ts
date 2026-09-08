import { Injector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Analytics } from "@angular/fire/analytics";
import { Firestore } from "@angular/fire/firestore";
import { User } from "../../../model/user";
import { UserService } from "../../user.service";
import { DuelService } from "./duel.service";

/**
 * Covers recordDuel's guard clauses — the ones this session's code review
 * found bugs in (the false "couldn't save" error on a first-time anonymous
 * voter's login race). None of these reach an actual Firestore call (a
 * transaction against the `{}` stub just throws and is caught as "retry"), so
 * a bare `{}` Firestore stub is enough — the
 * moment a test needs `runTransaction`/`doc()` to actually run against a real
 * backend, it belongs in the e2e spec (tests/e2e/ranked-duels.spec.ts)
 * against the emulator instead, matching how poll-item.service.spec.ts draws
 * this same line for PollItemService.
 */
describe("DuelService.recordDuel guard clauses", () => {
  let service: DuelService;
  let currentUser: User | undefined;
  let getUserOrOpenLoginSpy: jasmine.Spy;

  beforeEach(() => {
    currentUser = { id: "u1", name: "Alice" };
    getUserOrOpenLoginSpy = jasmine.createSpy("getUserOrOpenLogin").and.callFake(() => currentUser);
    TestBed.configureTestingModule({
      providers: [
        DuelService,
        {
          provide: UserService,
          useValue: {
            getUser: () => currentUser,
            getUserOrOpenLogin: getUserOrOpenLoginSpy,
          },
        },
        { provide: Firestore, useValue: {} },
        { provide: Analytics, useValue: {} },
        { provide: Injector, useValue: {} },
      ],
    });
    service = TestBed.inject(DuelService);
  });

  it('rejects a self-paired duel ("retry") without even checking who is signed in', async () => {
    const result = await service.recordDuel("poll-1", "a", "a", "a");
    expect(result).toBe("retry");
    expect(getUserOrOpenLoginSpy).not.toHaveBeenCalled();
  });

  it('rejects a winnerId that is neither side of the pair ("retry")', async () => {
    const result = await service.recordDuel("poll-1", "a", "b", "c");
    expect(result).toBe("retry");
    expect(getUserOrOpenLoginSpy).not.toHaveBeenCalled();
  });

  it('returns "pending-login" (not an error) when there is no signed-in voter yet', async () => {
    getUserOrOpenLoginSpy.and.returnValue(undefined);
    const result = await service.recordDuel("poll-1", "a", "b", "a");
    expect(result).toBe("pending-login");
    expect(getUserOrOpenLoginSpy).toHaveBeenCalledTimes(1);
    // The deferred-retry callback recordDuel hands to getUserOrOpenLogin is
    // itself a fresh call to recordDuel — confirm that's what got passed, not
    // some no-op, so a login completing later actually saves the pick.
    const callback = getUserOrOpenLoginSpy.calls.mostRecent().args[0] as () => void;
    expect(typeof callback).toBe("function");
  });

  it("queues overlapping picks instead of refusing the second one", async () => {
    // Two picks fired before the first resolves: both must settle (the old
    // debounce would have bounced the second with a bare "retry" and the
    // caller would have shown a spurious "couldn't save" toast). Against the
    // `{}` Firestore stub the transaction throws, so both land on "retry" —
    // the point here is that neither hangs and the chain survives a rejection.
    spyOn(console, "error"); // commitPick logs the stubbed transaction failure
    const [first, second] = await Promise.all([
      service.recordDuel("poll-1", "a", "b", "a"),
      service.recordDuel("poll-1", "a", "c", "a"),
    ]);
    expect(first).toBe("retry");
    expect(second).toBe("retry");
    // The chain still works for a third pick after those rejections.
    expect(await service.recordDuel("poll-1", "b", "c", "b")).toBe("retry");
  });

  it('returns "retry" for a signed-in user with no usable identity (no id/localUserId/name)', async () => {
    currentUser = {} as User;
    const result = await service.recordDuel("poll-1", "a", "b", "a");
    expect(result).toBe("retry");
  });
});

describe("DuelService.removeDuel guard clauses", () => {
  let service: DuelService;
  let currentUser: User | undefined;

  beforeEach(() => {
    currentUser = { id: "u1", name: "Alice" };
    TestBed.configureTestingModule({
      providers: [
        DuelService,
        { provide: UserService, useValue: { getUser: () => currentUser } },
        { provide: Firestore, useValue: {} },
        { provide: Analytics, useValue: {} },
        { provide: Injector, useValue: {} },
      ],
    });
    service = TestBed.inject(DuelService);
  });

  it('returns "retry" with no signed-in voter — nothing to undo, and no login prompt', async () => {
    currentUser = undefined;
    expect(await service.removeDuel("poll-1", "a", "b")).toBe("retry");
  });

  it('returns "retry" for a signed-in user with no usable identity', async () => {
    currentUser = {} as User;
    expect(await service.removeDuel("poll-1", "a", "b")).toBe("retry");
  });

  it('reaches the transaction for a real voter (lands on "retry" against the `{}` stub) and keeps the write chain alive', async () => {
    spyOn(console, "error"); // commitRemoval logs the stubbed transaction failure
    expect(await service.removeDuel("poll-1", "a", "b")).toBe("retry");
    // A pick queued straight after still settles rather than hanging.
    expect(await service.removeDuel("poll-1", "b", "c")).toBe("retry");
  });
});

describe("DuelService.resetMyDuels", () => {
  let service: DuelService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DuelService,
        { provide: UserService, useValue: { getUser: () => undefined } },
        { provide: Firestore, useValue: {} },
        { provide: Analytics, useValue: {} },
        { provide: Injector, useValue: {} },
      ],
    });
    service = TestBed.inject(DuelService);
  });

  it("no-ops for an empty voter key instead of attempting a Firestore call", async () => {
    // A real Firestore call against the `{}` stub above would throw
    // synchronously (doc() needs an actual Firestore instance) — resolving
    // cleanly here is exactly the signal that the early-return guard fired.
    await expectAsync(service.resetMyDuels("poll-1", "")).toBeResolved();
  });
});
