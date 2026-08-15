import { Page } from "@playwright/test";

// Shared by every spec in tests/e2e — this is what would have caught D1's
// NG0919 even without the static import-cycle guard (scripts/check-import-cycles.mjs),
// because the click that opens the broken dialog "succeeds"; only the console
// shows the failure. Call before navigating, then call the returned function
// after the flow under test to assert nothing leaked to the console.
// Firebase Analytics and Installations are the two SDKs app.module.ts
// initialises that have no emulator — they always talk to the real Google
// endpoints, and both reject the placeholder apiKey that the e2e build
// deliberately uses (environment.e2e.template.ts, materialized by
// .github/workflows/e2e.yml) with a 400 "API key not valid". That is a
// property of running against fake credentials, not an app regression, and it
// can't be fixed the way AppCheck's was (app.module.ts skips provideAppCheck
// when useEmulators) because three components inject Analytics and would get
// undefined. These patterns are namespaced to those two SDKs' own error
// strings, so they can't mask an error raised by application code.
const PLACEHOLDER_CREDENTIAL_ERRORS = [
  /@firebase\/analytics/,
  /Analytics: Dynamic config fetch failed/,
  /installations\/request-failed/,
  /Installations: Create Installation request failed/,
];

// The same two failed requests are reported twice: once by the SDK (matched
// above) and once by the browser itself, as a bare "Failed to load resource:
// the server responded with a status of 400 ()". That text names no URL, so
// matching on it would blanket-ignore every 400 the app makes. The console
// message's location() does carry the resource URL though, so these are
// matched by host instead — a 400 from anywhere else still fails the test.
const PLACEHOLDER_CREDENTIAL_HOSTS =
  /^https:\/\/(firebaseinstallations\.googleapis\.com|firebase\.googleapis\.com)\//;

function isExpectedInE2E(message: string, resourceUrl = ""): boolean {
  return (
    PLACEHOLDER_CREDENTIAL_ERRORS.some((pattern) => pattern.test(message)) ||
    (resourceUrl !== "" && PLACEHOLDER_CREDENTIAL_HOSTS.test(resourceUrl))
  );
}

export function failOnConsoleErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (!isExpectedInE2E(e.message)) errors.push(e.message);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (isExpectedInE2E(m.text(), m.location().url)) return;
    errors.push(m.text());
  });
  return () => {
    if (errors.length > 0) {
      throw new Error(`Console errors:\n${errors.join("\n")}`);
    }
  };
}
