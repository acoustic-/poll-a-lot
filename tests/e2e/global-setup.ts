import * as admin from "firebase-admin";
import { MAIN_POLL, SHORT_DESC_POLL, OWNER_REF, IDENTITY_POLL, LIVE_PROFILE } from "./fixtures";

// Playwright's webServer entries are up (health-checked) by the time this runs, so
// the Firestore/Auth emulators are already listening on these ports.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

export default async function globalSetup(): Promise<void> {
  const app = admin.initializeApp({ projectId: "poll-a-lot" });
  const db = app.firestore();

  await db.doc(`polls/${MAIN_POLL.id}`).set({
    id: MAIN_POLL.id,
    name: MAIN_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    moviepoll: false,
    date: new Date(MAIN_POLL.dateSeconds * 1000),
    description: MAIN_POLL.description,
  });
  await Promise.all(
    MAIN_POLL.items.map((item, order) =>
      db.doc(`polls/${MAIN_POLL.id}/pollItems/${item.id}`).set({
        id: item.id,
        pollId: MAIN_POLL.id,
        name: item.name,
        created: Date.now().toString(),
        order,
        voters: item.voterIds.map((voterId) => ({
          id: voterId,
          name: voterId,
          timestamp: Date.now(),
        })),
      })
    )
  );

  await db.doc(`polls/${SHORT_DESC_POLL.id}`).set({
    id: SHORT_DESC_POLL.id,
    name: SHORT_DESC_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    moviepoll: false,
    description: SHORT_DESC_POLL.description,
  });
  await Promise.all(
    SHORT_DESC_POLL.items.map((item, order) =>
      db.doc(`polls/${SHORT_DESC_POLL.id}/pollItems/${item.id}`).set({
        id: item.id,
        pollId: SHORT_DESC_POLL.id,
        name: item.name,
        created: Date.now().toString(),
        order,
        voters: [],
      })
    )
  );

  await db.doc(`polls/${IDENTITY_POLL.id}`).set({
    id: IDENTITY_POLL.id,
    name: IDENTITY_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    // true only to surface the voter-filter menu chrome (gated on
    // poll.moviepoll in poll.component.html), which is where the resolved
    // display name is directly assertable as text — the item itself has no
    // movieId/seriesId, so it still renders as a plain option-card.
    moviepoll: true,
  });
  await db.doc(`polls/${IDENTITY_POLL.id}/pollItems/${IDENTITY_POLL.itemId}`).set({
    id: IDENTITY_POLL.itemId,
    pollId: IDENTITY_POLL.id,
    name: IDENTITY_POLL.itemName,
    created: Date.now().toString(),
    order: 0,
    voters: IDENTITY_POLL.voters.map((voter) => ({
      id: voter.id,
      name: voter.snapshotName,
      timestamp: Date.now(),
    })),
  });
  // publicProfiles/{uid} — bypasses firestore.rules (admin SDK), same as every
  // other seed write here, but this is the one real-world write path this
  // phase's UserService.upsertPublicProfile would otherwise perform on sign-in.
  await db.doc(`publicProfiles/${LIVE_PROFILE.uid}`).set({
    uid: LIVE_PROFILE.uid,
    displayName: LIVE_PROFILE.displayName,
    photoURL: LIVE_PROFILE.photoURL,
    updatedAt: Date.now(),
  });

  await app.delete();
}
