#!/usr/bin/env node
// Materializes the gitignored src/environments/*.ts files a fresh clone
// needs to run `yarn start`/`yarn test`/`yarn test:e2e` at all, from their
// checked-in *.template.ts placeholders — same copy CI does per-workflow
// (see .github/workflows/*.yml), but for local dev. Never overwrites an
// existing file, so it won't clobber real secrets you've already filled in.
//
// Runs automatically via package.json's "postinstall" hook; safe to
// re-run by hand (`node scripts/setup-env-files.mjs`) any time.
//
// environment.prod.ts is deliberately not included: it only matters for
// `ng build --configuration production`, which isn't part of the local
// dev golden path, and CI materializes it from a real secret rather than
// a placeholder.

import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_DIR = resolve(__dirname, "../src/environments");

const FILES = ["environment.ts", "environment.e2e.ts", "version.ts"];

for (const file of FILES) {
  const target = join(ENV_DIR, file);
  const template = join(ENV_DIR, file.replace(/\.ts$/, ".template.ts"));
  if (existsSync(target)) continue;
  copyFileSync(template, target);
  console.log(`Created src/environments/${file} from its template.`);
}
