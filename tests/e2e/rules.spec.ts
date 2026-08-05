import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  terminate,
  where,
  documentId,
} from "firebase/firestore";
import { LIVE_PROFILE } from "./fixtures";

// Exercises firestore.rules directly against the emulator with a bare,
// unauthenticated client SDK instance — not through the Angular app — so
// these assertions hold regardless of what UserIdentityService happens to
// do. That matters because the property under test is a security boundary
// (Tier 1 of the publicProfiles enumeration fix): it must hold even for a
// client that never goes through the app's own code at all.
test.describe("firestore.rules: publicProfiles", () => {
  test("a list query is denied (closes the bulk-scrape/enumeration gap)", async () => {
    const app = initializeApp(
      { projectId: "poll-a-lot", apiKey: "test-key" },
      "rules-spec-list"
    );
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, "localhost", 8080);

    try {
      const q = query(
        collection(firestore, "publicProfiles"),
        where(documentId(), "in", [LIVE_PROFILE.uid])
      );
      await expect(getDocs(q)).rejects.toMatchObject({ code: "permission-denied" });
    } finally {
      await terminate(firestore);
      await deleteApp(app);
    }
  });

  test("a get by a known uid still succeeds (legitimate single-profile lookups keep working)", async () => {
    const app = initializeApp(
      { projectId: "poll-a-lot", apiKey: "test-key" },
      "rules-spec-get"
    );
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, "localhost", 8080);

    try {
      const snap = await getDoc(doc(firestore, "publicProfiles", LIVE_PROFILE.uid));
      expect(snap.exists()).toBe(true);
      expect(snap.data()?.["displayName"]).toBe(LIVE_PROFILE.displayName);
    } finally {
      await terminate(firestore);
      await deleteApp(app);
    }
  });
});
