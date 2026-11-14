import { test, expect } from "@playwright/test";
import * as admin from "firebase-admin";
import { FirebaseApp, deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  Firestore,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  terminate,
  updateDoc,
} from "firebase/firestore";

// The pollItems rules in firestore.rules, exercised against the Firestore + Auth
// emulators with real signed-in users and an unauthenticated ("anonymous
// localUserId") caller. No browser involved.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

interface Caller {
  db: Firestore;
  /** The Firebase uid, or undefined for an unauthenticated caller. */
  uid?: string;
  close(): Promise<void>;
}

async function caller(label: string | null): Promise<Caller> {
  const app: FirebaseApp = initializeApp(
    { projectId: "poll-a-lot", apiKey: "test-key" },
    `rules-${label ?? "anon"}-${RUN}`
  );
  let uid: string | undefined;
  if (label) {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    uid = (await createUserWithEmailAndPassword(auth, `${label}-${RUN}@example.com`, "password123")).user.uid;
  }
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "localhost", 8080);
  return {
    db,
    uid,
    close: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

async function allowed(op: Promise<unknown>): Promise<boolean> {
  try {
    await op;
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "permission-denied") return false;
    throw error;
  }
}

const adminDb = () => (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: "poll-a-lot" })).firestore();

test.describe("pollItems firestore rules", () => {
  let owner: Caller;
  let creator: Caller;
  let other: Caller;
  let anon: Caller;
  let seq = 0;

  test.beforeAll(async () => {
    [owner, creator, other, anon] = await Promise.all([caller("owner"), caller("creator"), caller("other"), caller(null)]);
  });
  test.afterAll(async () => {
    await Promise.all([owner, creator, other, anon].map((c) => c.close()));
  });

  /** A fresh poll owned by `owner`, holding one item by a Google creator and one by a local-name user. */
  async function seed(poll: Record<string, unknown> = {}) {
    const id = `rules-${RUN}-${++seq}`;
    const db = adminDb();
    await db.doc(`polls/${id}`).set({ id, name: "Rules", owner: { id: owner.uid }, allowAdd: true, ...poll });
    const item = (itemId: string, creatorRef: Record<string, unknown>) =>
      db.doc(`polls/${id}/pollItems/${itemId}`).set({
        id: itemId, pollId: id, name: itemId, created: "1", voters: [], order: 0, creator: creatorRef,
      });
    await item("google", { id: creator.uid, name: "Creator" });
    await item("local", { name: "Anon", localUserId: "local-1" });
    return {
      id,
      ref: (c: Caller, itemId: string) => doc(collection(c.db, `polls/${id}/pollItems`), itemId),
    };
  }

  test("anyone can read items", async () => {
    const p = await seed();
    expect((await getDoc(p.ref(anon, "google"))).exists()).toBe(true);
  });

  test("anyone can vote and react on an open poll", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "google"), { voters: [{ name: "Anon", localUserId: "l", timestamp: 1 }] }))).toBe(true);
    expect(await allowed(updateDoc(p.ref(other, "google"), { reactions: [{ label: "x", users: [{ id: other.uid }] }] }))).toBe(true);
  });

  test("only the creator (Google) or the owner can edit a Google creator's description", async () => {
    const p = await seed();
    expect(await allowed(updateDoc(p.ref(anon, "google"), { description: "hijack" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(other, "google"), { description: "hijack" }))).toBe(false);
    expect(await allowed(updateDoc(p.ref(creator, "google"), { description: "mine" }))).toBe(true);
    expect(await allowed(updateDoc(p.ref(owner, "google"), { description: "owner's" }))).toBe(true);
  });

  test("a local-name creator's description stays editable by anyone (nothing to verify against)", async () => {
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

  test("a Google creator's item can be deleted by them or the owner, not by anyone else", async () => {
    const p = await seed();
    expect(await allowed(deleteDoc(p.ref(anon, "google")))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(other, "google")))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(creator, "google")))).toBe(true);
    const q = await seed();
    expect(await allowed(deleteDoc(q.ref(owner, "google")))).toBe(true);
  });

  test("a local-name creator's item can be deleted by anyone (documented gap)", async () => {
    const p = await seed();
    expect(await allowed(deleteDoc(p.ref(anon, "local")))).toBe(true);
  });

  test("adding: anonymous visitors only where allowed, and never as a Google user", async () => {
    const open = await seed();
    const add = (c: Caller, pollId: string, creatorRef: Record<string, unknown>, itemId = `new-${++seq}`) =>
      setDoc(doc(collection(c.db, `polls/${pollId}/pollItems`), itemId), {
        id: itemId, pollId, name: itemId, created: "1", voters: [], order: 9, creator: creatorRef,
      });
    expect(await allowed(add(anon, open.id, { name: "Anon", localUserId: "l" }))).toBe(true);
    expect(await allowed(add(anon, open.id, { id: creator.uid, name: "Creator" }))).toBe(false);
    expect(await allowed(add(other, open.id, { id: other.uid, name: "Other" }))).toBe(true);

    const closed = await seed({ allowAdd: false });
    expect(await allowed(add(anon, closed.id, { name: "Anon", localUserId: "l" }))).toBe(false);
    expect(await allowed(add(owner, closed.id, { id: owner.uid, name: "Owner" }))).toBe(true);

    const locked = await seed({ locked: new Date() });
    expect(await allowed(add(anon, locked.id, { name: "Anon", localUserId: "l" }))).toBe(false);
  });

  test("an item must carry its own poll id and doc id", async () => {
    const p = await seed();
    const itemId = `mis-${++seq}`;
    const write = (data: Record<string, unknown>) =>
      setDoc(doc(collection(anon.db, `polls/${p.id}/pollItems`), itemId), { name: "x", voters: [], order: 1, ...data });
    expect(await allowed(write({ id: itemId, pollId: "other-poll" }))).toBe(false);
    expect(await allowed(write({ id: "different", pollId: p.id }))).toBe(false);
    expect(await allowed(write({ id: itemId, pollId: p.id }))).toBe(true);
  });

  test("a locked poll freezes voting and removal for everyone but the owner", async () => {
    const p = await seed({ locked: new Date() });
    expect(await allowed(updateDoc(p.ref(anon, "local"), { voters: [{ name: "A", localUserId: "l", timestamp: 1 }] }))).toBe(false);
    expect(await allowed(deleteDoc(p.ref(creator, "google")))).toBe(false);
    expect(await allowed(updateDoc(p.ref(owner, "google"), { voters: [] }))).toBe(true);
    expect(await allowed(deleteDoc(p.ref(owner, "google")))).toBe(true);
  });

  test("the AI suggestion cache is writable by anyone, even on a locked poll", async () => {
    const p = await seed({ locked: new Date() });
    expect(await allowed(updateDoc(p.ref(anon, "local"), { suggestionAI: { text: "t" } }))).toBe(true);
  });

  test("items of a deleted poll can be cleaned up by anyone", async () => {
    const p = await seed();
    await adminDb().doc(`polls/${p.id}`).delete();
    expect(await allowed(deleteDoc(p.ref(anon, "google")))).toBe(true);
  });
});
