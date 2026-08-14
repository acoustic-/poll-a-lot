import { Page } from "@playwright/test";

// Shared by every spec in tests/e2e — this is what would have caught D1's
// NG0919 even without the static import-cycle guard (scripts/check-import-cycles.mjs),
// because the click that opens the broken dialog "succeeds"; only the console
// shows the failure. Call before navigating, then call the returned function
// after the flow under test to assert nothing leaked to the console.
export function failOnConsoleErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return () => {
    if (errors.length > 0) {
      throw new Error(`Console errors:\n${errors.join("\n")}`);
    }
  };
}
