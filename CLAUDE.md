# poll-a-lot

## Code style

- Within a class, `private` methods go after all non-private (public) members.

## Environment

- The shell's default `node`/`npm` is too old for this repo (v10). Before any
  `npm`/`ng`/`npx`/`yarn` command: `nvm use` (reads `.nvmrc`, pinned to
  `22.22.3`). `package.json`'s `engines.node` (`^20.19.0 || ^22.12.0 ||
  >=24.0.0`) is looser than reality — `@eslint/js@10.0.1` actually requires
  `^22.13.0+`, so `v22.12.0` (in-range per `engines` but below that) fails
  `yarn install` with an "incompatible module" error. `22.22.3` is
  confirmed working for `yarn install`, `ng build`, and `ng test`.
- Use **yarn**, not npm — the repo ships `yarn.lock`, not `package-lock.json`.
  `yarn` isn't on `PATH` by default; run `corepack enable` once per shell
  after `nvm use` to get it (pulls yarn 1.22.22 via corepack). Plain `npm
  install`/`npm i` can hard-fail here (`Cannot read properties of null
  (reading 'children')` from npm's arborist) since there's no npm lockfile
  for it to resolve against — use `yarn add -D <pkg>` / `yarn remove <pkg>`.
- `ng build` with no `--configuration` flag compiles against `environment.ts`
  (the dev/template file), not `environment.prod.ts` — safe for a type-check
  pass without touching the file that holds real secrets.
- `ng test` runs headless via Karma (`karma.conf.js`: `browsers:
  ['ChromeHeadless']`, `singleRun: true`), but `angular.json`'s `test`
  target uses the `@angular/build:karma` builder, which has its own
  top-level watch mode independent of `singleRun` — without `--watch=false`
  it keeps the underlying esbuild/file watcher (and the Chrome process)
  alive indefinitely even after Karma reports all specs passed. `yarn test`
  (`package.json`) passes `--watch=false` for exactly this reason; pass
  `--browsers=Chrome --watch` explicitly for interactive/watch mode instead.
  `yarn test:coverage` (`ng test --watch=false --code-coverage`) produces a
  coverage report (`karma-coverage`, not the old broken
  `karma-coverage-istanbul-reporter`).

## Gotchas

- The `mat-autocomplete` overlay panel renders nested inside its own
  `mat-form-field` here, not portaled to a global overlay container like
  standard Angular Material. A `(click)` handler on an ancestor (e.g. the
  form field's wrapping container) will fire on every option click unless
  you stop propagation explicitly — this caused a real bug in
  movie-search-input (the panel reopening itself right after a selection).
