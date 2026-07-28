import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4200",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "Mobile Chrome",
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
    },
    {
      command: "yarn ng serve --configuration=e2e",
      url: "http://localhost:4200",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
