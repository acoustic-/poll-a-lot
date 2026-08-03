import { test, expect } from "@playwright/test";
import { SHARE_PHOTO_POLL, VOTER_WITH_PHOTO, VOTER_WITHOUT_PHOTO } from "./fixtures";

test.describe("shareProfilePhoto", () => {
  test("voter with shareProfilePhoto=true shows an avatar <img>", async ({ page }) => {
    await page.goto(`/poll/${SHARE_PHOTO_POLL.id}`);
    const stack = page.getByTestId("avatar-stack").first();
    await expect(stack).toBeVisible();

    // The voter whose publicProfile has a real photoURL must render an <img>.
    const imgs = stack.locator("img");
    await expect(imgs).toHaveCount(1);
  });

  test("voter with shareProfilePhoto=false (photoURL=null) falls back to initials, no <img>", async ({ page }) => {
    await page.goto(`/poll/${SHARE_PHOTO_POLL.id}`);
    const stack = page.getByTestId("avatar-stack").first();
    await expect(stack).toBeVisible();

    // VOTER_WITHOUT_PHOTO has photoURL=null — must render initials, not an image.
    const initialsChips = stack.locator(".avatar.initials");
    await expect(initialsChips).toHaveCount(1);
  });

  test("voter filter list shows display names and no <img> for the no-photo voter", async ({ page }) => {
    await page.goto(`/poll/${SHARE_PHOTO_POLL.id}`);
    await page.getByLabel("Filter by voter").click();
    const voterList = page.locator(".voter-list");

    // Both voters' resolved display names (from publicProfiles) appear.
    await expect(voterList).toContainText(VOTER_WITH_PHOTO.displayName);
    await expect(voterList).toContainText(VOTER_WITHOUT_PHOTO.displayName);

    // Only the voter with a photo has an <img> in the list.
    const listItems = voterList.locator("li");
    const withPhotoItem = listItems.filter({ hasText: VOTER_WITH_PHOTO.displayName });
    const withoutPhotoItem = listItems.filter({ hasText: VOTER_WITHOUT_PHOTO.displayName });

    await expect(withPhotoItem.locator("img")).toHaveCount(1);
    await expect(withoutPhotoItem.locator("img")).toHaveCount(0);
    await expect(withoutPhotoItem.locator(".avatar.initials")).toHaveCount(1);
  });
});
