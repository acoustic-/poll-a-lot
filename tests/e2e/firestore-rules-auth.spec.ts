import { test, expect } from "@playwright/test";
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { Caller, RUN, adminDb, allowed, caller, linkedCaller } from "./helpers/rules";

// The auth side of firestore.rules (polls, duel ballots, public profiles) against
// the Firestore + Auth emulators: a Google account may do everything it could
// before, a nickname (Anonymous Auth) account may vote, add and duel but never
// create polls or publish a profile, and someone who isn't signed in may only read.

const pick = (n = 1) => ({ aId: "a", bId: "b", winnerId: "a", ts: n });

test.describe("auth firestore rules", () => {
  let owner: Caller; // Google
  let nick: Caller; // nickname (Anonymous Auth)
  let other: Caller; // another nickname account
  let nobody: Caller; // not signed in
  let seq = 0;

  test.beforeAll(async () => {
    [owner, nick, other, nobody] = await Promise.all([
      caller("owner", "google"),
      caller("nick", "anonymous"),
      caller("other", "anonymous"),
      caller("nobody", "nobody"),
    ]);
  });
  test.afterAll(async () => {
    await Promise.all([owner, nick, other, nobody].map((c) => c.close()));
  });

  const newPoll = (c: Caller, id: string) =>
    setDoc(doc(collection(c.db, "polls"), id), { id, name: "P", owner: { id: c.uid } });

  async function seedPoll() {
    const id = `auth-${RUN}-${++seq}`;
    await adminDb().doc(`polls/${id}`).set({ id, name: "P", owner: { id: owner.uid }, allowAdd: true });
    return id;
  }

  test.describe("polls", () => {
    test("a Google account can create a poll it owns; a nickname account and a visitor can't", async () => {
      expect(await allowed(newPoll(owner, `auth-${RUN}-g`))).toBe(true);
      expect(await allowed(newPoll(nick, `auth-${RUN}-n`))).toBe(false);
      expect(await allowed(setDoc(doc(collection(nobody.db, "polls"), `auth-${RUN}-x`), { id: "x", owner: { id: "x" } }))).toBe(false);
    });

    test("only a Google account can list its polls", async () => {
      const mine = (c: Caller) => getDocs(query(collection(c.db, "polls"), where("owner.id", "==", c.uid)));
      expect(await allowed(mine(owner))).toBe(true);
      expect(await allowed(mine(nick))).toBe(false);
    });

    test("a nickname account that has just linked Google can create a poll with no reload", async () => {
      const linked = await linkedCaller("linked");
      try {
        expect(await allowed(newPoll(linked, `auth-${RUN}-linked`))).toBe(true);
        const profile = { uid: linked.uid, displayName: "Linked", photoURL: null, updatedAt: 1 };
        expect(await allowed(setDoc(doc(collection(linked.db, "publicProfiles"), linked.uid), profile))).toBe(true);
      } finally {
        await linked.close();
      }
    });

    test("any signed-in user can clear the generated description; a visitor can't", async () => {
      const id = await seedPoll();
      const ref = (c: Caller) => doc(collection(c.db, "polls"), id);
      expect(await allowed(updateDoc(ref(nick), { descriptionAI: "" }))).toBe(true);
      expect(await allowed(updateDoc(ref(nobody), { descriptionAI: "" }))).toBe(false);
      expect(await allowed(updateDoc(ref(nick), { name: "renamed" }))).toBe(false);
    });
  });

  test.describe("public profiles", () => {
    test("only a Google account can publish its own profile", async () => {
      const profile = (c: Caller) => ({ uid: c.uid, displayName: "Name", photoURL: null, updatedAt: 1 });
      const write = (c: Caller) => setDoc(doc(collection(c.db, "publicProfiles"), c.uid), profile(c));
      expect(await allowed(write(owner))).toBe(true);
      expect(await allowed(write(nick))).toBe(false);
    });
  });

  test.describe("duel ballots", () => {
    const ballotRef = (c: Caller, pollId: string, key: string) =>
      doc(collection(c.db, `polls/${pollId}/duelBallots`), key);
    const ballot = (c: Caller, picks = [pick()]) => ({
      voterRef: { id: c.uid, name: "V" },
      updatedAt: 1,
      picks,
    });

    test("a signed-in voter creates, updates and deletes only their own ballot", async () => {
      const pollId = await seedPoll();
      expect(await allowed(setDoc(ballotRef(nick, pollId, nick.uid!), ballot(nick)))).toBe(true);
      expect(await allowed(setDoc(ballotRef(nick, pollId, nick.uid!), ballot(nick, [pick(1), pick(2)])))).toBe(true);

      // Not someone else's key, and not under your own key claiming to be them.
      expect(await allowed(setDoc(ballotRef(other, pollId, nick.uid!), ballot(other)))).toBe(false);
      expect(await allowed(setDoc(ballotRef(other, pollId, other.uid!), ballot(nick)))).toBe(false);
      expect(await allowed(setDoc(ballotRef(other, pollId, nick.uid!), ballot(nick)))).toBe(false);
      expect(await allowed(deleteDoc(ballotRef(other, pollId, nick.uid!)))).toBe(false);
      expect(await allowed(deleteDoc(ballotRef(nick, pollId, nick.uid!)))).toBe(true);
    });

    test("a visitor who isn't signed in can't write a ballot", async () => {
      const pollId = await seedPoll();
      expect(await allowed(setDoc(ballotRef(nobody, pollId, "x"), { voterRef: { id: "x" }, updatedAt: 1, picks: [pick()] }))).toBe(false);
    });

    test("the poll's owner can delete anyone's ballot", async () => {
      const pollId = await seedPoll();
      await setDoc(ballotRef(nick, pollId, nick.uid!), ballot(nick));
      expect(await allowed(deleteDoc(ballotRef(owner, pollId, nick.uid!)))).toBe(true);
    });

    test("a ballot can't be re-identified", async () => {
      const pollId = await seedPoll();
      await setDoc(ballotRef(nick, pollId, nick.uid!), ballot(nick));
      expect(await allowed(updateDoc(ballotRef(nick, pollId, nick.uid!), { voterRef: { id: other.uid, name: "V" } }))).toBe(false);
    });

    test("a pre-2.0 ballot (no voterRef.id) can be emptied by a signed-in voter, but not claimed", async () => {
      const pollId = await seedPoll();
      await adminDb()
        .doc(`polls/${pollId}/duelBallots/legacy-1`)
        .set({ voterRef: { localUserId: "legacy-1", name: "Old" }, updatedAt: 1, picks: [pick()] });
      expect(await allowed(updateDoc(ballotRef(nick, pollId, "legacy-1"), { voterRef: { id: nick.uid, name: "Old" } }))).toBe(false);
      expect(await allowed(updateDoc(ballotRef(nick, pollId, "legacy-1"), { picks: [], updatedAt: 2 }))).toBe(true);
      expect(await allowed(updateDoc(ballotRef(nobody, pollId, "legacy-1"), { picks: [], updatedAt: 3 }))).toBe(false);
    });
  });
});
