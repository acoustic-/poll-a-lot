// Shared between global-setup.ts (which writes these into the Firestore emulator)
// and the specs (which assert against them) so the two never drift apart.

export const LONG_DESCRIPTION =
  "This is a long poll description written specifically to overflow the two-line " +
  "clamp on a narrow mobile viewport, so the 'Show more' toggle is guaranteed to " +
  "appear regardless of font metrics. It keeps going for a while to be safe, " +
  "covering enough characters that even a wide desktop viewport clamps it too.";

export const MAIN_POLL = {
  id: "e2e-poll",
  name: "E2E Test Poll",
  description: LONG_DESCRIPTION,
  // A fixed future date (seconds since epoch) — the regression target for the
  // "21/1/1970" bug (poll.component.html's FirestoreDatePipe usage).
  dateSeconds: Math.floor(new Date("2026-08-15T12:00:00Z").getTime() / 1000),
  expectedDateText: "15/8/2026",
  items: [
    { id: "item-1", name: "Option A", voterIds: ["voter-1"] },
    { id: "item-2", name: "Option B", voterIds: [] },
    { id: "item-3", name: "Option C", voterIds: ["voter-1", "voter-2"] },
  ],
  get totalVotes() {
    return this.items.reduce((sum, item) => sum + item.voterIds.length, 0);
  },
  get totalOptions() {
    return this.items.length;
  },
};

export const SHORT_DESC_POLL = {
  id: "e2e-poll-short-desc",
  name: "E2E Short Description Poll",
  description: "Short description.",
  items: [{ id: "item-1", name: "Solo Option", voterIds: [] }],
};

export const OWNER_REF = { id: "e2e-owner", name: "E2E Owner" };
