import { test, expect } from "./helpers/base";
import { doc, getDoc } from "firebase/firestore";
import { signInWithGoogle, signInAsLocalUser } from "./helpers/auth";
import { withFirestore } from "./helpers/firestore";

// Every test starts genuinely logged out — playwright.config.ts's default
// storageState is "already seen the welcome dialog", not "signed in", so no
// extra setup is needed for that.
test.describe("login", () => {
  test("Google sign-in via the Auth emulator popup unlocks Google-only pages", async ({ page }) => {
    await page.goto("/add-poll");
    await expect(page.locator(".login-card")).toBeVisible();

    await signInWithGoogle(page, { email: "login-e2e@example.com", name: "Login E2E User" });

    // isGoogleUser() gates both: the header menu swaps Login for Logout, and
    // /add-poll renders the form instead of the sign-in gate.
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Logout")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.locator(".login-card")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /name/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("local name-only login produces a weak user that can vote but not reach /add-poll's form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByLabel("Login").click();

    await expect(page.locator("app-login-dialog")).toBeVisible();
    await page.getByPlaceholder("Nickname").fill("Weak Login User");
    await page.getByRole("button", { name: "Save" }).click();

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Logout")).toBeVisible();
    // My polls / Watchlist are Google-only menu items (header.component.html:
    // "@if (user.id !== undefined)") — a weak user never gets them.
    await expect(page.getByLabel("My polls")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/add-poll");
    await expect(page.locator(".login-card")).toBeVisible();
  });

  test("a weak user hitting a Google-only page (My Polls) sees the Google sign-in gate", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Weak Gate User", localUserId: "login-weak-gate" });
    await page.goto("/manage");

    await expect(page.locator(".login-card")).toBeVisible();
    await expect(page.getByText("Only the newest 10 polls are shown")).toHaveCount(0);
  });

  test("session persists across reload", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Reload User", localUserId: "login-reload-user" });
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Logout")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.reload();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Logout")).toBeVisible();
  });

  test("logout requires confirming the snackbar action, then signs out", async ({ page }) => {
    await signInAsLocalUser(page, { name: "Logout User", localUserId: "login-logout-user" });
    await page.goto("/");

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByLabel("Logout").click();

    const snack = page.getByText("Are you sure?");
    await expect(snack).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByText("Logged out!")).toBeVisible();

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByLabel("Login")).toBeVisible();
    await expect(page.getByLabel("Logout")).toHaveCount(0);
  });

  test("signing in with Google upserts publicProfiles/{uid} with a displayName", async ({ page }) => {
    const user = { email: "publicprofile-e2e@example.com", name: "Public Profile User" };
    await page.goto("/add-poll");
    const uid = await signInWithGoogle(page, user);
    expect(uid).toBeTruthy();

    await withFirestore(async (db) => {
      await expect
        .poll(async () => (await getDoc(doc(db, `publicProfiles/${uid}`))).exists(), { timeout: 10000 })
        .toBe(true);
      const snap = await getDoc(doc(db, `publicProfiles/${uid}`));
      // Only the forename is ever stored (user.service.ts's onAuthStateChanged
      // takes user.displayName.split(" ")[0]) — a deliberate privacy choice
      // documented in the login dialog's own copy, not a truncation bug.
      expect(snap.data()?.["displayName"]).toBe(user.name.split(" ")[0]);
    });
  });
});
