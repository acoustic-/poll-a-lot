// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: "{{ YOUR OWN VALUES }}",
    authDomain: "{{ YOUR OWN VALUES }}",
    databaseURL: "{{ YOUR OWN VALUES }}",
    projectId: "{{ YOUR OWN VALUES }}",
    storageBucket: "{{ YOUR OWN VALUES }}",
    messagingSenderId: "{{ YOUR OWN VALUES }}",
  },
  recaptcheV3SiteKey: "{{ YOUR OWN VALUES }}",
  analytics: "{{ YOU OWN VALUES }}",
  movieDb: {
    tmdbKey: "{{ YOUR OWN VALUES }}",
    omdbKey: "{{ YOUR OWN VALUES }}"
  },
  letterboxFollowUsers: [],
};
