import { defineConfig, devices } from "@playwright/test";
import { CHROMIUM, MOBILE_CHROME } from "./tests/e2e/project-names";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4200",
    trace: "on-first-retry",
    // Every existing spec predates the first-visit welcome dialog and
    // doesn't expect it — default every context to "already seen" so it
    // doesn't intercept clicks across the whole suite. welcome-dialog.spec.ts
    // opts out of this per-test where it needs a genuinely fresh visitor.
    storageState: "tests/e2e/storageState.welcome-seen.json",
  },
  projects: [
    {
      name: CHROMIUM,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: MOBILE_CHROME,
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Seeds fixture data into the emulators once they're up but before any test
  // runs — Playwright starts/health-checks every `webServer` entry first.
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
  webServer: [
    {
      command: "yarn firebase emulators:start --only auth,firestore --project poll-a-lot",
      url: "http://127.0.0.1:4000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // Without a real ADC, `emulators:start` still probes the GCE metadata
      // service (169.254.169.254) to auto-detect credentials. GitHub-hosted
      // runners are Azure VMs that serve their own instance-metadata on that
      // same link-local IP, so the probe gets a real-but-wrong response
      // instead of a clean refusal, crashing the emulator before it starts.
      // `none` skips the probe entirely — safe since these are emulators.
      env: { METADATA_SERVER_DETECTION: "none" },
    },
    {
      command: "yarn ng serve --configuration=e2e",
      url: "http://localhost:4200",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
