// Shared between global-setup.ts (which writes these into the Firestore emulator)
// and the specs (which assert against them) so the two never drift apart.

// For a fixture that a mutating spec runs against under both Playwright
// projects concurrently (fullyParallel: true): global-setup seeds one copy
// per project at scopedId(id, projectName), and the spec reads/writes that
// scoped id instead of the bare one, so chromium and Mobile Chrome never
// touch the same Firestore document. test.describe.serial alone doesn't
// cover this — it only orders tests within a single project's worker.
export function scopedId(baseId: string, projectName: string): string {
  return `${baseId}--${projectName.replace(/\s+/g, "-").toLowerCase()}`;
}

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

// One item, 5 voters — enough to overflow avatar-stack's max=3 to "+3". Voter 1
// gets a live publicProfile (different name + a photo) to test that live
// resolution overrides the frozen vote snapshot; voters 2-5 are plain frozen
// snapshots with no live profile, exercising the fallback path.
export const IDENTITY_POLL = {
  id: "e2e-identity-poll",
  name: "E2E Identity Poll",
  itemId: "item-1",
  itemName: "Only Option",
  max: 3,
  voters: [
    { id: "identity-voter-1", snapshotName: "Old Snapshot Name" },
    { id: "identity-voter-2", snapshotName: "Voter Two" },
    { id: "identity-voter-3", snapshotName: "Voter Three" },
    { id: "identity-voter-4", snapshotName: "Voter Four" },
    { id: "identity-voter-5", snapshotName: "Voter Five" },
  ],
  // avatar-stack's overflow chip occupies one of the `max` slots (see
  // avatar-stack.component.ts's visible/overflowCount getters), so only
  // max-1 avatars actually render once voters exceed max.
  get visibleCount() {
    return this.max - 1;
  },
  get overflowCount() {
    return this.voters.length - this.visibleCount;
  },
};

export const LIVE_PROFILE = {
  uid: "identity-voter-1",
  displayName: "New Live Name",
  // A real, tiny 1x1 PNG data: URI — not a fake googleusercontent.com URL. The
  // browser genuinely fails to load a non-existent remote image, which
  // correctly trips <user-avatar>'s (error) fallback to initials — that's the
  // component working as designed, not something to work around. A data: URI
  // loads with no network dependency, giving a deterministic <img> to assert.
  photoURL:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
};

// A separate poll for the shareProfilePhoto test: two voters, voter-A has a photo
// (shareProfilePhoto=true) and voter-B has photo=null (shareProfilePhoto=false).
// This lets us assert in one poll that hiding the photo works independently of the
// "user has never had a photo" fallback path.
export const SHARE_PHOTO_POLL = {
  id: "e2e-share-photo-poll",
  name: "E2E Share Photo Poll",
  itemId: "item-1",
  itemName: "Only Option",
};

export const VOTER_WITH_PHOTO = {
  uid: "share-photo-voter-with",
  displayName: "Has Photo",
  photoURL:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
};

export const VOTER_WITHOUT_PHOTO = {
  uid: "share-photo-voter-without",
  displayName: "No Photo",
  photoURL: null,
};

// allowAdd is easy to miss: poll.component.html hides the "Add new item" button
// entirely without it. movieId 550 matches tests/e2e/fixtures/tmdb/movies.json
// ("Fight Club") so the seeded item and the stubbed search results agree.
export const MOVIE_POLL = {
  id: "e2e-movie-poll",
  name: "E2E Movie Poll",
  itemId: "item-1",
  itemMovieId: 550,
  itemTitle: "Fight Club",
  // Present in fixtures/tmdb/movies.json but not seeded as a poll item — the
  // "add a new movie" specs search for and add these two (kept distinct so
  // tests that each add one movie never collide with the duplicate guard).
  searchableMovieId: 603,
  searchableMovieTitle: "The Matrix",
  secondSearchableMovieId: 27205,
  secondSearchableMovieTitle: "Inception",
  thirdSearchableMovieId: 157336,
  thirdSearchableMovieTitle: "Interstellar",
};

// Dedicated to voting.spec.ts (not shared with MAIN_POLL) so its vote mutations
// never race poll-stats.spec.ts's fixed-count assertions on MAIN_POLL under
// Playwright's default parallel execution.
export const VOTING_POLL = {
  id: "e2e-voting-poll",
  name: "E2E Voting Poll",
  items: [
    { id: "item-1", name: "Option A" },
    { id: "item-2", name: "Option B" },
  ],
};

export const SINGLE_VOTE_POLL = {
  id: "e2e-single-vote-poll",
  name: "E2E Single Vote Poll",
  items: [
    { id: "item-1", name: "Option A" },
    { id: "item-2", name: "Option B" },
  ],
};

export const LOCKED_MOVIE_POLL = {
  id: "e2e-locked-movie-poll",
  name: "E2E Locked Movie Poll",
  itemId: "item-1",
  itemMovieId: 550,
  itemTitle: "Fight Club",
};

export const POINT_VOTING_POLL = {
  id: "e2e-point-voting-poll",
  name: "E2E Point Voting Poll",
  budget: 5,
  maxPerItem: 3,
  items: [
    { id: "item-1", name: "Option A" },
    { id: "item-2", name: "Option B" },
  ],
};

// 12 voters — enough to overflow the poll header's participant avatar stack
// (D2/T3.7's regression target). A movie poll (not a plain one) so its single
// item renders via movie-poll-item, which gives it its own avatar-stack too —
// one fixture covers both the header stack and the per-item stack.
export const CROWDED_POLL = {
  id: "e2e-crowded-poll",
  name: "E2E Crowded Poll",
  itemId: "item-1",
  itemMovieId: 550,
  itemTitle: "Fight Club",
  voterIds: Array.from({ length: 12 }, (_, i) => `crowded-voter-${i + 1}`),
};
