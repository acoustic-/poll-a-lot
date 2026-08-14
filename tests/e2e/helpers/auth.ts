import { Page } from "@playwright/test";

// Drives the real Google sign-in popup against the Auth emulator (not a stub) —
// clicking any <login-button> ("Login with Google") opens
// localhost:9099/emulator/auth/handler, and the emulator's IDP Login Widget lets
// us create/select an account entirely offline. Field ids (#email-input,
// #display-name-input, #sign-in) are the widget's own, verified by enumerating the
// popup DOM against this app's emulator.
// Returns the Firebase uid the emulator assigned — captured off the
// accounts:signInWithIdp response's `localId` field rather than guessed from
// browser storage, since callers that need to look up this user's Firestore
// documents (publicProfiles/{uid}, users/{uid}) have no other reliable way to
// learn the uid the emulator chose.
export async function signInWithGoogle(
  page: Page,
  user: { email: string; name: string } = { email: "e2e@example.com", name: "E2E Google User" }
): Promise<string> {
  const popupPromise = page.waitForEvent("popup");
  // Role-scoped, not getByText("Login with Google") — several login-card
  // gates (e.g. poll-management's "you must login with Google.") phrase their
  // copy so it also matches that plain-text query, and as a <p> it sits
  // before the real <button> in the DOM, so .first() would click the
  // paragraph instead and the popup would never open.
  await page.getByRole("button", { name: "Login with Google" }).first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  const signInResponsePromise = Promise.race([
    page.waitForResponse((r) => r.url().includes(":signInWithIdp")),
    popup.waitForResponse((r) => r.url().includes(":signInWithIdp")),
  ]);
  await popup.getByText("Add new account").click();
  await popup.locator("#email-input").fill(user.email);
  await popup.locator("#display-name-input").fill(user.name);
  await popup.locator("#sign-in").click();
  const signInResponse = await signInResponsePromise;
  const { localId } = await signInResponse.json();
  await popup.waitForEvent("close").catch(() => {});
  return localId as string;
}

// Voting/adding items only need a weak (name-only) user — seeding localStorage
// directly is faster and popup-free compared to driving the login dialog's form.
// Must run via addInitScript *before* the app's first script executes, so call
// this ahead of page.goto().
export async function signInAsLocalUser(
  page: Page,
  user: { name: string; localUserId: string } = { name: "E2E Voter", localUserId: "e2e-voter-1" }
): Promise<void> {
  await page.addInitScript((seedUser) => {
    localStorage.setItem("welcome_seen", "true");
    localStorage.setItem("user", JSON.stringify(seedUser));
  }, user);
}
