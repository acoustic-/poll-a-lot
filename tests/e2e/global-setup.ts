import * as admin from "firebase-admin";
import {
  MAIN_POLL,
  SHORT_DESC_POLL,
  OWNER_REF,
  IDENTITY_POLL,
  LIVE_PROFILE,
  SHARE_PHOTO_POLL,
  VOTER_WITH_PHOTO,
  VOTER_WITHOUT_PHOTO,
  MOVIE_POLL,
  LOCKED_MOVIE_POLL,
  VOTING_POLL,
  SINGLE_VOTE_POLL,
  POINT_VOTING_POLL,
  CROWDED_POLL,
  scopedId,
} from "./fixtures";
import { E2E_PROJECT_NAMES } from "./project-names";

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

  // SHARE_PHOTO_POLL: two voters — one with a photo URL, one with null (photo hidden).
  await db.doc(`polls/${SHARE_PHOTO_POLL.id}`).set({
    id: SHARE_PHOTO_POLL.id,
    name: SHARE_PHOTO_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    moviepoll: true,
  });
  await db.doc(`polls/${SHARE_PHOTO_POLL.id}/pollItems/${SHARE_PHOTO_POLL.itemId}`).set({
    id: SHARE_PHOTO_POLL.itemId,
    pollId: SHARE_PHOTO_POLL.id,
    name: SHARE_PHOTO_POLL.itemName,
    created: Date.now().toString(),
    order: 0,
    voters: [
      { id: VOTER_WITH_PHOTO.uid, name: VOTER_WITH_PHOTO.displayName, timestamp: Date.now() },
      { id: VOTER_WITHOUT_PHOTO.uid, name: VOTER_WITHOUT_PHOTO.displayName, timestamp: Date.now() },
    ],
  });
  await db.doc(`publicProfiles/${VOTER_WITH_PHOTO.uid}`).set({
    uid: VOTER_WITH_PHOTO.uid,
    displayName: VOTER_WITH_PHOTO.displayName,
    photoURL: VOTER_WITH_PHOTO.photoURL,
    updatedAt: Date.now(),
  });
  await db.doc(`publicProfiles/${VOTER_WITHOUT_PHOTO.uid}`).set({
    uid: VOTER_WITHOUT_PHOTO.uid,
    displayName: VOTER_WITHOUT_PHOTO.displayName,
    photoURL: VOTER_WITHOUT_PHOTO.photoURL,
    updatedAt: Date.now(),
  });

  // MOVIE_POLL: allowAdd:true is required or poll.component.html hides the
  // "Add new item" button entirely (see fixtures.ts). add-movie-poll-item.spec.ts
  // mutates this poll, and fullyParallel:true runs both Playwright projects
  // concurrently against the same emulator, so each project gets its own
  // scoped copy of the doc rather than racing a shared one.
  for (const projectName of E2E_PROJECT_NAMES) {
    const moviePollId = scopedId(MOVIE_POLL.id, projectName);
    await db.doc(`polls/${moviePollId}`).set({
      id: moviePollId,
      name: MOVIE_POLL.name,
      owner: OWNER_REF,
      created: new Date(),
      theme: "DEFAULT",
      selectMultiple: true,
      moviepoll: true,
      allowAdd: true,
    });
    await db.doc(`polls/${moviePollId}/pollItems/${MOVIE_POLL.itemId}`).set({
      id: MOVIE_POLL.itemId,
      pollId: moviePollId,
      name: MOVIE_POLL.itemTitle,
      created: Date.now().toString(),
      order: 0,
      voters: [],
      movieId: MOVIE_POLL.itemMovieId,
      moviePollItemData: {
        id: MOVIE_POLL.itemMovieId,
        title: MOVIE_POLL.itemTitle,
        originalTitle: MOVIE_POLL.itemTitle,
        tagline: "Mischief. Mayhem. Soap.",
        overview: "A ticking-time-bomb insomniac and a slippery soap salesman.",
        director: "David Fincher",
        productionCountry: "United States of America",
        runtime: 139,
        releaseDate: "1999-10-15",
        posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        backdropPath: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
        tmdbRating: 8.4,
      },
    });
  }

  // VOTING_POLL / SINGLE_VOTE_POLL: voting.spec.ts votes and retracts on these
  // and asserts counts relative to the poll's current state, so (as with
  // MOVIE_POLL and POINT_VOTING_POLL above) each project needs its own copy.
  // Sharing one doc across the two concurrently-running projects made
  // "clicking an item votes" flake in CI — the avatar-stack assertion saw the
  // *other* project's voters (3 avatars instead of 1) and the relative vote
  // counts drifted under the sibling project's writes.
  for (const projectName of E2E_PROJECT_NAMES) {
    const votingPollId = scopedId(VOTING_POLL.id, projectName);
    await db.doc(`polls/${votingPollId}`).set({
      id: votingPollId,
      name: VOTING_POLL.name,
      owner: OWNER_REF,
      created: new Date(),
      theme: "DEFAULT",
      selectMultiple: true,
      moviepoll: false,
    });
    await Promise.all(
      VOTING_POLL.items.map((item, order) =>
        db.doc(`polls/${votingPollId}/pollItems/${item.id}`).set({
          id: item.id,
          pollId: votingPollId,
          name: item.name,
          created: Date.now().toString(),
          order,
          voters: [],
        })
      )
    );

    const singleVotePollId = scopedId(SINGLE_VOTE_POLL.id, projectName);
    await db.doc(`polls/${singleVotePollId}`).set({
      id: singleVotePollId,
      name: SINGLE_VOTE_POLL.name,
      owner: OWNER_REF,
      created: new Date(),
      theme: "DEFAULT",
      selectMultiple: false,
      moviepoll: false,
    });
    await Promise.all(
      SINGLE_VOTE_POLL.items.map((item, order) =>
        db.doc(`polls/${singleVotePollId}/pollItems/${item.id}`).set({
          id: item.id,
          pollId: singleVotePollId,
          name: item.name,
          created: Date.now().toString(),
          order,
          voters: [],
        })
      )
    );
  }

  await db.doc(`polls/${LOCKED_MOVIE_POLL.id}`).set({
    id: LOCKED_MOVIE_POLL.id,
    name: LOCKED_MOVIE_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    moviepoll: true,
    allowAdd: true,
    locked: admin.firestore.Timestamp.now(),
  });
  await db.doc(`polls/${LOCKED_MOVIE_POLL.id}/pollItems/${LOCKED_MOVIE_POLL.itemId}`).set({
    id: LOCKED_MOVIE_POLL.itemId,
    pollId: LOCKED_MOVIE_POLL.id,
    name: LOCKED_MOVIE_POLL.itemTitle,
    created: Date.now().toString(),
    order: 0,
    voters: [],
    movieId: LOCKED_MOVIE_POLL.itemMovieId,
  });

  // POINT_VOTING_POLL: point-voting.spec.ts mutates this poll's per-user
  // budget across a serial chain of tests, and (as with MOVIE_POLL above)
  // fullyParallel:true runs both Playwright projects concurrently against the
  // same emulator, so each project gets its own scoped copy.
  for (const projectName of E2E_PROJECT_NAMES) {
    const pointVotingPollId = scopedId(POINT_VOTING_POLL.id, projectName);
    await db.doc(`polls/${pointVotingPollId}`).set({
      id: pointVotingPollId,
      name: POINT_VOTING_POLL.name,
      owner: OWNER_REF,
      created: new Date(),
      theme: "DEFAULT",
      selectMultiple: true,
      moviepoll: false,
      pointVoting: {
        pointVoting: true,
        pointVotingBudget: POINT_VOTING_POLL.budget,
        pointVotingMaxPerItem: POINT_VOTING_POLL.maxPerItem,
      },
    });
    await Promise.all(
      POINT_VOTING_POLL.items.map((item, order) =>
        db.doc(`polls/${pointVotingPollId}/pollItems/${item.id}`).set({
          id: item.id,
          pollId: pointVotingPollId,
          name: item.name,
          created: Date.now().toString(),
          order,
          voters: [],
        })
      )
    );
  }

  await db.doc(`polls/${CROWDED_POLL.id}`).set({
    id: CROWDED_POLL.id,
    name: CROWDED_POLL.name,
    owner: OWNER_REF,
    created: new Date(),
    theme: "DEFAULT",
    selectMultiple: true,
    moviepoll: true,
  });
  await db.doc(`polls/${CROWDED_POLL.id}/pollItems/${CROWDED_POLL.itemId}`).set({
    id: CROWDED_POLL.itemId,
    pollId: CROWDED_POLL.id,
    name: CROWDED_POLL.itemTitle,
    created: Date.now().toString(),
    order: 0,
    movieId: CROWDED_POLL.itemMovieId,
    moviePollItemData: {
      id: CROWDED_POLL.itemMovieId,
      title: CROWDED_POLL.itemTitle,
      originalTitle: CROWDED_POLL.itemTitle,
      tagline: "Mischief. Mayhem. Soap.",
      overview: "A ticking-time-bomb insomniac and a slippery soap salesman.",
      director: "David Fincher",
      productionCountry: "United States of America",
      runtime: 139,
      releaseDate: "1999-10-15",
      posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      backdropPath: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
      tmdbRating: 8.4,
    },
    voters: CROWDED_POLL.voterIds.map((voterId) => ({
      id: voterId,
      name: voterId,
      timestamp: Date.now(),
    })),
  });

  await app.delete();
}
