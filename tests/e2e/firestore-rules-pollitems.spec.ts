import { test, expect } from "@playwright/test";
import { collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { Caller, RUN, adminDb, allowed, caller } from "./helpers/rules";

// The pollItems rules in firestore.rules, exercised against the Firestore + Auth
// emulators with real signed-in users: Google accounts, nickname (anonymous)
// accounts, and an unauthenticated caller who must be refused everywhere.

test.describe("pollItems firestore rules", () => {
  let owner: Caller;
  let creator: Caller;
  let other: Caller;
  let anon: Caller; // a nickname user (Anonymous Auth)
  let nickCreator: Caller; // a nickname user who added an item
  let nobody: Caller; // not signed in
  let seq = 0;

  test.beforeAll(async () => {
    [owner, creator, other, anon, nickCreator, nobody] = await Promise.all([
      caller("owner", "google"),
      caller("creator", "google"),
      caller("other", "google"),
      caller("anon", "anonymous"),
      caller("nick", "anonymous"),
      caller("nobody", "nobody"),
    ]);
  });
  test.afterAll(async () => {
    await Promise.all([owner, creator, other, anon, nickCreator, nobody].map((c) => c.close()));
  });

  /** A fresh poll owned by `owner`, holding an item by a Google creator, one by a
   *  nickname account, and one from before 2.0 by a nickname user with no auth. */
  async function seed(poll: Record<string, unknown> = {}) {
    const id = `rules-${RUN}-${++seq}`;
    const db = adminDb();
    await db.doc(`polls/${id}`).set({ id, name: "Rules", owner: { id: owner.uid }, allowAdd: true, ...poll });
    const item = (itemId: string, creatorRef: Record<string, unknown>) =>
      db.doc(`polls/${id}/pollItems/${itemId}`).set({
        id: itemId, pollId: id, name: itemId, created: "1", voters: [], order: 0, creator: creatorRef,
      });
    await item("google", { id: creator.uid, name: "Creator" });
    await item("nick", { id: nickCreator.uid, name: "Nick" });
    await item("local", { name: "Anon", localUserId: "local-1" });
    return {
      id,
      ref: (c: Caller, itemId: string) => doc(collection(c.db, `polls/${id}/pollItems`), itemId),
    };
  }

  test("anyone can read items, even when not signed in", async () => {
    const p = await seed();
    expect((await getDoc(p.ref(nobody, "google"))).exists()).toBe(true);
  });

  test("a caller who isn't signed in can't write anything", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(nobody, "google"), { voters: [{ name: "X", timestamp: 1 }] }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(nobody, "google"), { suggestionAI: { text: "t" } }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(nobody, "local"), { description: "x" }))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(nobody, "local")))).toBe(false);
  });

  test("any signed-in user can vote and react on an open poll", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "google"), { voters: [{ id: anon.uid, name: "Anon", timestamp: 1 }] }))).toBe(true);
    expect(await allowed(updateDoc(p.ref(other, "google"), { reactions: [{ label: "x", users: [{ id: other.uid }] }] }))).toBe(true);
  });

  test("a vote that is added has to be the caller's own", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "google"), { voters: [{ id: other.uid, name: "Other", timestamp: 1 }] }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(anon, "google"), { voters: [{ name: "Nameless", timestamp: 1 }] }))).toBe(false);
    expect(
      await allowed(
        updateDoc(p.ref(anon, "google"), {
          voters: [
            { id: anon.uid, timestamp: 1 },
            { id: anon.uid, timestamp: 2 },
            { id: anon.uid, timestamp: 3 },
          ],
        })
      )
    ).toBe(false);
  });

  test("only the creator or the owner can edit an item's description", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "google"), { description: "hijack" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(other, "google"), { description: "hijack" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(creator, "google"), { description: "mine" }))).toBe(true);
    expect(await allowed(updateDoc(p.ref(owner, "google"), { description: "owner's" }))).toBe(true);

    // The same holds for an item a nickname account added: it is now verifiable.
    expect(await allowed(updateDoc(p.ref(anon, "nick"), { description: "hijack" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(nickCreator, "nick"), { description: "mine" }))).toBe(true);
  });

  test("a pre-2.0 item (creator has no uid) stays editable by any signed-in user (documented gap)", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "local"), { description: "ok" }))).toBe(true);
  });

  test("only the owner can hide, select or reorder", async () => {
    const p = await seed();
    for (const change of [{ visible: false }, { selected: true }, { order: 3 }]) {
      expect(await allowed(updateDoc(p.ref(anon, "google"), change))).toBe(false);
      expect(await allowed(updateDoc(p.ref(creator, "google"), change))).toBe(false);
      expect(await allowed(updateDoc(p.ref(owner, "google"), change))).toBe(true);
    }
  });

  test("identity and parentage can't be rewritten", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(creator, "google"), { creator: { id: other.uid } }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(owner, "google"), { pollId: "elsewhere" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(anon, "local"), { name: "renamed" }))).toBe(false);
  });

  test("an item can be deleted by its creator or the owner, not by anyone else", async () => {
    const p = await seed();
    expect(await allowed(deleteDoc(p.ref(anon, "google")))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(other, "google")))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(creator, "google")))).toBe(true);
    const q = await seed();
    expect(await allowed(deleteDoc(q.ref(owner, "google")))).toBe(true);
  });

  test("a nickname account's item can be deleted by that account, not by another nickname user", async () => {
    const p = await seed();
    expect(await allowed(deleteDoc(p.ref(anon, "nick")))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(nickCreator, "nick")))).toBe(true);
  });

  test("a pre-2.0 item (creator has no uid) can still be deleted by any signed-in user (documented gap)", async () => {
    const p = await seed();
    expect(await allowed(deleteDoc(p.ref(anon, "local")))).toBe(true);
  });

  test("adding: signed-in visitors only where allowed, and only as themselves", async () => {
    const open = await seed();
    const add = (c: Caller, pollId: string, creatorRef: Record<string, unknown>, itemId = `new-${++seq}`) =>
      setDoc(doc(collection(c.db, `polls/${pollId}/pollItems`), itemId), {
        id: itemId, pollId, name: itemId, created: "1", voters: [], order: 9, creator: creatorRef,
      });
    expect(await allowed(add(anon, open.id, { id: anon.uid, name: "Anon" }))).toBe(true);
    expect(await allowed(add(anon, open.id, { id: creator.uid, name: "Creator" }))).toBe(false);
    expect(await allowed(add(anon, open.id, { name: "Anon", localUserId: "l" }))).toBe(false);
    expect(await allowed(add(other, open.id, { id: other.uid, name: "Other" }))).toBe(true);
    expect(await allowed(add(nobody, open.id, { id: "x", name: "Nobody" }))).toBe(false);

    const closed = await seed({ allowAdd: false });
    expect(await allowed(add(anon, closed.id, { id: anon.uid, name: "Anon" }))).toBe(false);
    expect(await allowed(add(owner, closed.id, { id: owner.uid, name: "Owner" }))).toBe(true);

    const locked = await seed({ locked: new Date() });
    expect(await allowed(add(anon, locked.id, { id: anon.uid, name: "Anon" }))).toBe(false);
  });

  test("an item must carry its own poll id and doc id", async () => {
    const p = await seed();
    const itemId = `mis-${++seq}`;
    const write = (data: Record<string, unknown>) =>
      setDoc(doc(collection(anon.db, `polls/${p.id}/pollItems`), itemId), { name: "x", voters: [], order: 1, creator: { id: anon.uid }, ...data });
    expect(await allowed(write({ id: itemId, pollId: "other-poll" }))).toBe(false);
    expect(await allowed(write({ id: "different", pollId: p.id }))).toBe(false);
    expect(await allowed(write({ id: itemId, pollId: p.id }))).toBe(true);
  });

  test("a locked poll freezes voting and removal for everyone but the owner", async () => {
    const p = await seed({ locked: new Date() });
    expect(await allowed(updateDoc(p.ref(anon, "local"), { voters: [{ id: anon.uid, name: "A", timestamp: 1 }] }))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(creator, "google")))).toBe(false);
    expect(await allowed(updateDoc(p.ref(owner, "google"), { voters: [] }))).toBe(true);
    expect(await allowed(deleteDoc(p.ref(owner, "google")))).toBe(true);
  });

  test("the AI suggestion cache is writable by any signed-in user, even on a locked poll", async () => {
    const p = await seed({ locked: new Date() });
    expect(await allowed(updateDoc(p.ref(anon, "local"), { suggestionAI: { text: "t" } }))).toBe(true);
  });

  test("items of a deleted poll can be cleaned up by any signed-in user", async () => {
    const p = await seed();
    await adminDb().doc(`polls/${p.id}`).delete();
    expect(await allowed(deleteDoc(p.ref(anon, "google")))).toBe(true);
  });
});
