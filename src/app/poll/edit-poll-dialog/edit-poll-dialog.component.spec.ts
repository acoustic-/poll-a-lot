import { Poll } from "../../../model/poll";
import { EditPollDialogComponent } from "./edit-poll-dialog.component";

// The constructor is DI-heavy (MatBottomSheet, Router, MAT_BOTTOM_SHEET_DATA);
// toggleDuelVoting / togglePointVoting / hasChanged only touch `this.pollTemp`
// and `this.poll`, so a constructor-less instance is enough — same trick as
// poll.component.spec.ts's callBuildVoterFilter.
function instance(poll: Partial<Poll> = {}): EditPollDialogComponent {
  const c = Object.create(EditPollDialogComponent.prototype) as EditPollDialogComponent;
  const base = { name: "P", selectMultiple: false, ...poll } as Poll;
  (c as unknown as { poll: Poll }).poll = base;
  (c as unknown as { pollTemp: Poll }).pollTemp = { ...base };
  c.clearPointVotes = false;
  c.clearDuels = false;
  return c;
}

describe("EditPollDialogComponent — Ranked Duels wiring", () => {
  it("toggleDuelVoting(true) clears the movie-list modes and point voting", () => {
    const c = instance({
      movieList: true,
      rankedMovieList: false,
      pointVoting: { pointVoting: true, pointVotingBudget: 5 },
    });
    c.toggleDuelVoting(true);
    expect(c.pollTemp.duelVoting?.duels).toBeTrue();
    expect(c.pollTemp.movieList).toBeFalse();
    expect(c.pollTemp.rankedMovieList).toBeFalse();
    expect(c.pollTemp.pointVoting?.pointVoting).toBeFalse();
  });

  it("togglePointVoting(true) clears duels — the two modes are exclusive", () => {
    const c = instance({ duelVoting: { duels: true } });
    c.togglePointVoting(true);
    expect(c.pollTemp.pointVoting?.pointVoting).toBeTrue();
    expect(c.pollTemp.duelVoting?.duels).toBeFalse();
  });

  it("toggleDuelVoting(false) just turns it off, touching nothing else", () => {
    const c = instance({ duelVoting: { duels: true }, useSeenReaction: true });
    c.toggleDuelVoting(false);
    expect(c.pollTemp.duelVoting?.duels).toBeFalse();
    expect(c.pollTemp.useSeenReaction).toBeTrue();
  });

  it("hasChanged() detects a flipped duels flag", () => {
    const c = instance({ duelVoting: { duels: false } });
    expect(c.hasChanged(c.pollTemp)).toBeTrue(); // nothing changed yet
    c.toggleDuelVoting(true);
    expect(c.hasChanged(c.pollTemp)).toBeFalse(); // now it differs -> Update enabled
  });

  it("hasChanged() treats undefined duelVoting and { duels: false } as equal", () => {
    const c = instance({ duelVoting: undefined });
    const updated = { ...c.pollTemp, duelVoting: { duels: false } } as Poll;
    expect(c.hasChanged(updated)).toBeTrue(); // still "no change"
  });

  it("clearDuels alone enables Update even with no field edits", () => {
    const c = instance({ duelVoting: { duels: true } });
    expect(c.hasChanged(c.pollTemp)).toBeTrue();
    c.clearDuels = true;
    expect(c.hasChanged(c.pollTemp)).toBeFalse();
  });

  it("update() forwards clearDuels on the dismissed payload", () => {
    const c = instance({ duelVoting: { duels: true } });
    c.clearDuels = true;
    const dismissed: unknown[] = [];
    (c as unknown as { bottomSheetRef: { dismiss: (v: unknown) => void } }).bottomSheetRef = {
      dismiss: (v: unknown) => dismissed.push(v),
    };
    c.update();
    expect((dismissed[0] as { clearDuels: boolean }).clearDuels).toBeTrue();
  });
});
