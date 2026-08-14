import { test, expect } from "./helpers/base";
import { MAIN_POLL } from "./fixtures";
import { failOnConsoleErrors } from "./helpers/console";

// Every route in app.module.ts's appRoutes, minus the wildcard (which just
// redirects to "/" and would be a duplicate of that same assertion).
const routes = [
  "/",
  "/about",
  "/watchlist",
  "/manage",
  "/add-poll",
  "/settings",
  `/poll/${MAIN_POLL.id}`,
];

for (const route of routes) {
  test(`${route} renders with no console errors`, async ({ page }) => {
    const assertNoConsoleErrors = failOnConsoleErrors(page);

    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    assertNoConsoleErrors();
  });
}
