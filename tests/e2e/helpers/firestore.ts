import { initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, getDocs, getFirestore, Firestore, terminate } from "firebase/firestore";

// A bare client SDK instance against the emulator, independent of the app under
// test — used where a spec needs to verify what actually landed in Firestore
// (order, counts, deletion) rather than only what the UI shows.
export async function withFirestore<T>(fn: (db: Firestore) => Promise<T>): Promise<T> {
  const app: FirebaseApp = initializeApp({ projectId: "poll-a-lot", apiKey: "test-key" }, `e2e-${Date.now()}-${Math.random()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "localhost", 8080);
  try {
    return await fn(db);
  } finally {
    await terminate(db);
    await deleteApp(app);
  }
}

export async function readPollItems(pollId: string): Promise<Record<string, unknown>[]> {
  return withFirestore(async (db) => {
    const snap = await getDocs(collection(db, `polls/${pollId}/pollItems`));
    return snap.docs.map((d) => d.data());
  });
}

// The UI's own item count updates optimistically off Firestore's local write
// cache, before the write is acknowledged by the server — closing the page
// right after that (as Playwright does at the end of a test) can race the
// network flush and lose the write. Polling Firestore directly here confirms
// the write is durable before the test (and its browser context) ends.
export async function waitForPollItemCount(
  pollId: string,
  count: number,
  timeoutMs = 10000
): Promise<Record<string, unknown>[]> {
  const start = Date.now();
  let items = await readPollItems(pollId);
  while (items.length !== count && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    items = await readPollItems(pollId);
  }
  if (items.length !== count) {
    throw new Error(`Timed out waiting for polls/${pollId}/pollItems to have ${count} items (has ${items.length})`);
  }
  return items;
}
