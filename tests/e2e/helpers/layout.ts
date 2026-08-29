import { expect, type Page } from "@playwright/test";

// Shared horizontal-overflow probe (docs/regression-test-plan.md T3.7): every
// element inside `rootSelector` whose box extends past the viewport's right edge
// or before its left edge, as a human-readable "tag.class [left..right] vs docW"
// string so a failing assertion names the offender.
//
// By default every offender is reported. Pass `{ ignoreClipped: true }` to skip
// elements sitting inside an ancestor that clips or scrolls horizontally
// (`overflow-x` other than `visible` — carousels, marquees, deliberate scroll
// strips like the landing page's popular-movies rows): those can't push the page
// sideways, so a whole-page sweep shouldn't flag them.
export async function overflowingElements(
  page: Page,
  rootSelector = "body",
  { ignoreClipped = false }: { ignoreClipped?: boolean } = {}
): Promise<string[]> {
  return page.evaluate(
    ({ sel, ignoreClipped }) => {
      const docW = document.documentElement.clientWidth;
      const root = document.querySelector(sel);
      const clippedByAncestor = (el: Element): boolean => {
        let node = el.parentElement;
        while (node && node !== root?.parentElement) {
          if (getComputedStyle(node).overflowX !== "visible") return true;
          node = node.parentElement;
        }
        return false;
      };
      return [...document.querySelectorAll(`${sel} *`)]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.right > docW + 1 || r.left < -1))
        .filter(({ el }) => !ignoreClipped || !clippedByAncestor(el))
        .map(
          ({ el, r }) =>
            `${el.tagName.toLowerCase()}.${el.className} [${Math.round(r.left)}..${Math.round(
              r.right
            )}] vs ${docW}`
        );
    },
    { sel: rootSelector, ignoreClipped }
  );
}

// Asserts `childSelector`'s horizontal extent stays within `containerSelector`'s
// (±1px), i.e. the child doesn't spill out the sides of its container.
export async function boundingBoxInside(
  page: Page,
  childSelector: string,
  containerSelector: string
): Promise<void> {
  const child = await page.locator(childSelector).boundingBox();
  const container = await page.locator(containerSelector).boundingBox();
  expect(child, `${childSelector} should be visible`).not.toBeNull();
  expect(container, `${containerSelector} should be visible`).not.toBeNull();
  expect(child!.x).toBeGreaterThanOrEqual(container!.x - 1);
  expect(child!.x + child!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
}
