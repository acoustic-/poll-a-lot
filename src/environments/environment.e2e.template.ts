// Copy this to environment.e2e.ts (gitignored, like environment.ts/environment.prod.ts)
// to run the Playwright suite (`yarn test:e2e`). Firestore/Auth are redirected to the
// local emulators regardless of these values (app.config.ts, gated on
// `useEmulators`), so the placeholders below are fine as-is unless a spec needs real
// TMDB/OMDB/Letterboxd data (none of tests/e2e's current specs do).

export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: "{{ YOUR OWN VALUES }}",
    authDomain: "{{ YOUR OWN VALUES }}",
    databaseURL: "{{ YOUR OWN VALUES }}",
    projectId: "poll-a-lot",
    storageBucket: "{{ YOUR OWN VALUES }}",
    messagingSenderId: "{{ YOUR OWN VALUES }}",
    appId: "{{ YOUR OWN VALUES }}",
  },
  recaptcheV3SiteKey: "{{ YOUR OWN VALUES }}",
  analytics: "{{ YOUR OWN VALUES }}",
  movieDb: {
    tmdbKey: "{{ YOUR OWN VALUES }}",
    omdbKey: "{{ YOUR OWN VALUES }}",
    letterboxdKey: "{{ YOUR OWN VALUES }}",
    letterboxdSharedSecret: "{{ YOUR OWN VALUES }}",
    dddKey: "{{ YOUR OWN VALUES }}",
  },
  letterboxFollowUsers: [],
};
