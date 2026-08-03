import { test, expect } from "@playwright/test";
import { MAIN_POLL } from "./fixtures";

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
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    expect(errors, `Console errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
  });
}
