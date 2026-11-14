import * as admin from "firebase-admin";
import { FirebaseApp, deleteApp, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
} from "firebase/auth";
import { Firestore, connectFirestoreEmulator, getFirestore, terminate } from "firebase/firestore";

// Helpers for the firestore.rules specs: real Auth-emulator users (Google,
// anonymous, or nobody) talking to the Firestore emulator through the client SDK,
// so the rules see exactly what they see in production. No browser involved.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

export const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export interface Caller {
  db: Firestore;
  app: FirebaseApp;
  /** The Firebase uid, or undefined for an unauthenticated caller. */
  uid?: string;
  close(): Promise<void>;
}

export type CallerKind = "google" | "anonymous" | "nobody";

/** The Auth emulator accepts an unsigned JSON "id token" as a Google credential. */
export function googleCredential(label: string) {
  return GoogleAuthProvider.credential(
    JSON.stringify({ sub: `${label}-${RUN}`, email: `${label}-${RUN}@example.com`, email_verified: true })
  );
}

export async function caller(label: string, kind: CallerKind): Promise<Caller> {
  const app = initializeApp({ projectId: "poll-a-lot", apiKey: "test-key" }, `rules-${label}-${RUN}`);
  let uid: string | undefined;
  if (kind !== "nobody") {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    uid =
      kind === "google"
        ? (await signInWithCredential(auth, googleCredential(label))).user.uid
        : (await signInAnonymously(auth)).user.uid;
  }
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "localhost", 8080);
  return {
    db,
    app,
    uid,
    close: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

/** A nickname user who then signs in with Google on the same uid, with no reload. */
export async function linkedCaller(label: string): Promise<Caller> {
  const c = await caller(label, "anonymous");
  const auth = getAuth(c.app);
  await linkWithCredential(auth.currentUser!, googleCredential(label));
  await auth.currentUser!.getIdToken(true);
  return c;
}

export async function allowed(op: Promise<unknown>): Promise<boolean> {
  try {
    await op;
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "permission-denied") return false;
    throw error;
  }
}

export const adminDb = () =>
  (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: "poll-a-lot" })).firestore();
