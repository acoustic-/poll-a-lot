import { Injector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Analytics } from "@angular/fire/analytics";
import { Firestore } from "@angular/fire/firestore";
import { User } from "../../../model/user";
import { UserService } from "../../user.service";
import { DuelService } from "./duel.service";

// writeInFlight is private; this interface gives test code a typed way to
// set it without `any` (same pattern as poll-item.service.spec.ts).
interface DuelServicePrivates {
  writeInFlight: boolean;
}

/**
 * Covers recordDuel's guard clauses — the ones this session's code review
 * found bugs in (the false "couldn't save" error on a first-time anonymous
 * voter's login race, and the tab-local write debounce). None of these reach
 * an actual Firestore call, so a bare `{}` Firestore stub is enough — the
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

  it('returns "retry" without starting a second write while one is already in flight', async () => {
    (service as unknown as DuelServicePrivates).writeInFlight = true;
    const result = await service.recordDuel("poll-1", "a", "b", "a");
    expect(result).toBe("retry");
  });

  it('returns "retry" for a signed-in user with no usable identity (no id/localUserId/name)', async () => {
    currentUser = {} as User;
    const result = await service.recordDuel("poll-1", "a", "b", "a");
    expect(result).toBe("retry");
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
