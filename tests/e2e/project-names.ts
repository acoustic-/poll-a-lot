// Single source of truth for Playwright's project names, so
// playwright.config.ts, global-setup.ts, and any spec that needs to give
// itself a per-project copy of a fixture (see fixtures.ts's scopedId) can
// never drift out of sync with each other.
export const CHROMIUM = "chromium";
export const MOBILE_CHROME = "Mobile Chrome";

export const E2E_PROJECT_NAMES = [CHROMIUM, MOBILE_CHROME] as const;
