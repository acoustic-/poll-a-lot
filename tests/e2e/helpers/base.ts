import { test as base, expect } from "@playwright/test";

// index.html loads Google Fonts over real HTTPS, and provideAnalytics()
// (app.module.ts) makes @angular/fire inject a real
// googletagmanager.com/gtag/js script at runtime — e2e tests shouldn't depend
// on live third-party CDNs any more than they depend on TMDb's (see
// stubMovieApis in helpers/tmdb.ts), and some sandboxed dev environments'
// network proxies can't present a trusted cert for arbitrary external
// domains, which the browser logs as a console error and trips
// failOnConsoleErrors (helpers/console.ts) on tests that assert none.
// Fulfilling with an empty-but-valid response — not aborting — matters: an
// aborted request still logs its own "Failed to load resource" console
// error, just under a different net error code, so it wouldn't actually fix
// anything. Every spec imports `test`/`expect` from here instead of directly
// from @playwright/test so this applies to every test with no per-spec setup.
const EXTERNAL_HOSTS = /^https:\/\/(fonts\.(googleapis|gstatic)|www\.googletagmanager|www\.google-analytics)\.com\//;

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(EXTERNAL_HOSTS, (route) => {
      const url = route.request().url();
      const contentType = url.includes("gstatic.com")
        ? "font/woff2"
        : url.includes("googletagmanager.com") || url.includes("google-analytics.com")
          ? "application/javascript"
          : "text/css";
      return route.fulfill({ status: 200, contentType, body: "" });
    });
    await use(page);
  },
});

export { expect };
