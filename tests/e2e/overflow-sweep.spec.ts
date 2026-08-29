import { test, expect } from "./helpers/base";
import { MAIN_POLL, POINT_VOTING_POLL, CROWDED_POLL, scopedId } from "./fixtures";
import { signInAsLocalUser } from "./helpers/auth";
import { stubMovieApis } from "./helpers/tmdb";
import { overflowingElements } from "./helpers/layout";

// Broader companion to layout.spec.ts's targeted probes: sweep the app's key
// routes at the viewport widths that historically surfaced horizontal overflow
// (docs/regression-test-plan.md T3.7) and assert nothing spills past the edges.
const WIDTHS = [320, 360, 768, 1280];

// Static / logged-out routes — no seeded fixture needed.
const STATIC_ROUTES = ["/", "/add-poll", "/settings", "/manage"];

test.describe("Overflow sweep", () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} has no horizontal overflow across ${WIDTHS.join("/")}px`, async ({ page }) => {
      await stubMovieApis(page);
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        expect(
          await overflowingElements(page, "body", { ignoreClipped: true }),
          `${route} @ ${width}px`
        ).toEqual([]);
      }
    });
  }

  // One test per poll route (rather than one loop over all of them) so each keeps
  // its own timeout budget — a goto + full-DOM probe at 4 widths is already close
  // to the default 30s on a loaded runner.
  const pollRoutes: Record<string, (project: string) => string> = {
    "plain-voting poll": () => `/poll/${MAIN_POLL.id}`,
    "point-voting poll": (project) => `/poll/${scopedId(POINT_VOTING_POLL.id, project)}`,
    "crowded movie poll": () => `/poll/${CROWDED_POLL.id}`,
  };

  for (const [label, routeFor] of Object.entries(pollRoutes)) {
    test(`${label} has no horizontal overflow across ${WIDTHS.join("/")}px`, async ({ page }, testInfo) => {
      await stubMovieApis(page);
      await signInAsLocalUser(page);
      await page.goto(routeFor(testInfo.project.name));
      await expect(page.locator(".poll-container, movie-poll-item").first()).toBeVisible();

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        expect(
          await overflowingElements(page, "body", { ignoreClipped: true }),
          `${label} @ ${width}px`
        ).toEqual([]);
      }
    });
  }
});
