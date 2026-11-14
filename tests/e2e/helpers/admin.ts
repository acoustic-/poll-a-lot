import * as admin from "firebase-admin";

// Fixture writes (resetting an item, seeding one) go through the Admin SDK, which
// bypasses security rules. The client SDK in helpers/firestore.ts is
// deliberately subject to them — it is how a spec reads back "what really
// landed" — so using it to overwrite whole documents would be testing the
// rules, not setting up state, and the pollItems rules (rightly) refuse it.
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";

export function adminDb(): admin.firestore.Firestore {
  return (admin.apps.length ? admin.app() : admin.initializeApp({ projectId: "poll-a-lot" })).firestore();
}
