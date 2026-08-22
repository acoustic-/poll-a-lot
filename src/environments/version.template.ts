// CI overwrites this during the deploy build (see .github/workflows/deploy.yml,
// "Generate version.ts" step) with the real package.json version, short commit
// SHA, and workflow run number for the commit actually being deployed. Local
// dev, unit tests (ci.yml), and e2e builds (e2e.yml) just use this placeholder.

export const VERSION = {
  version: "0.0.0-dev",
  commit: "dev",
  runNumber: "0",
  builtAt: "1970-01-01T00:00:00Z",
};
