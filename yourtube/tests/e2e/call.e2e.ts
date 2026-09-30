import { readFileSync } from "fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { db, makeFriends, markOtpForLatestSignIn, seedUser, type SeedUser } from "./seed";

declare global {
  interface Window {
    __yourtubeTest: { signIn(email: string, password: string): Promise<{ user: { getIdTokenResult(): Promise<{ claims: Record<string, unknown> }> } }> };
  }
}

/** A browser window signed in as `user`, past the OTP step. */
async function signedIn(browser: Browser, user: SeedUser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/?testRegion=MH");
  await page.waitForFunction(() => !!window.__yourtubeTest);
  const authTime = await page.evaluate(async ([email, password]) => {
    const cred = await window.__yourtubeTest.signIn(email, password);
    return Number((await cred.user.getIdTokenResult()).claims.auth_time);
  }, [user.email, user.password]);
  await markOtpForLatestSignIn(user, authTime);
  await page.reload();
  await expect(page.getByRole("link", { name: /Friends & calls/ })).toBeVisible({ timeout: 30_000 });
  return page;
}

test("friends: request by email, accept, both see each other", async ({ browser }) => {
  const [a, b] = [await seedUser("Asha"), await seedUser("Bala")];
  const pa = await signedIn(browser, a);
  const pb = await signedIn(browser, b);

  await pa.goto("/call");
  await pa.getByLabel("Friend's email").fill(b.email);
  await pa.getByRole("button", { name: "Add friend" }).click();
  await expect(pa.getByText("Friend request sent")).toBeVisible();
  await expect(pa.getByTestId("friend-outgoing")).toContainText("Bala");

  await pb.goto("/call");
  await expect(pb.getByTestId("friend-incoming")).toContainText("Asha");
  await pb.getByRole("button", { name: "Accept" }).click();

  // Presence heartbeats are running in both windows, so each shows the other online.
  await expect(pb.getByTestId("friend-accepted")).toContainText("Online");
  await expect(pa.getByTestId("friend-accepted")).toContainText("Bala");
  await expect(pa.getByTestId("friend-accepted")).toContainText("Online");
});

test("call: ring → accept → video both ways → recording indicator + file → hang up", async ({ browser }) => {
  const [a, b] = [await seedUser("Caller"), await seedUser("Callee")];
  await makeFriends(a, b);
  const pa = await signedIn(browser, a);
  const pb = await signedIn(browser, b);

  await pa.goto(`/call?to=${b.uid}`);
  await expect(pa.getByTestId("call-status")).toContainText("Ringing Callee");

  // Callee gets a real-time toast anywhere in the app.
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pb).toHaveURL(/\/call\?id=/);

  for (const p of [pa, pb]) {
    await expect(p.getByTestId("call-status")).toContainText(/· \d+:\d{2}/, { timeout: 30_000 });
    await expect
      .poll(() => p.getByTestId("remote-video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);
  }

  // Record on A: both sides show the indicator (B learns via the data channel).
  await pa.evaluate(() => {
    // Headless has no save dialog; exercise the <a download> fallback.
    (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
  });
  await pa.getByTestId("record-button").click();
  await expect(pa.getByTestId("recording-indicator")).toHaveText(/REC/);
  await expect(pb.getByTestId("recording-indicator")).toContainText("Caller is recording");
  await pa.waitForTimeout(3000);
  const [download] = await Promise.all([pa.waitForEvent("download"), pa.getByTestId("record-button").click()]);
  expect(download.suggestedFilename()).toMatch(/^yourtube-call-\d{8}-\d{4}\.webm$/);
  const file = readFileSync(await download.path());
  expect(file.length).toBeGreaterThan(20_000);
  expect(file.subarray(0, 4).toString("hex")).toBe("1a45dfa3"); // WebM/EBML header
  await expect(pb.getByTestId("recording-indicator")).toHaveCount(0);

  // Hang up on A: B is told, and the signalling docs are cleaned up.
  const callId = new URL(pb.url()).searchParams.get("id")!;
  await pa.getByTestId("hangup-button").click();
  await expect(pa.getByTestId("call-ended")).toContainText("You ended the call");
  await expect(pb.getByTestId("call-ended")).toContainText("Caller ended the call");
  await expect.poll(async () => (await db.doc(`calls/${callId}`).get()).exists, { timeout: 10_000 }).toBe(false);
  expect((await db.collection(`calls/${callId}/callerCandidates`).get()).size).toBe(0);
});

test("call: callee declines", async ({ browser }) => {
  const [a, b] = [await seedUser("Dev"), await seedUser("Esha")];
  await makeFriends(a, b);
  const pa = await signedIn(browser, a);
  const pb = await signedIn(browser, b);
  await pa.goto(`/call?to=${b.uid}`);
  await expect(pa.getByTestId("call-status")).toContainText("Ringing");
  await pb.getByRole("button", { name: "Decline" }).click();
  await expect(pa.getByTestId("call-ended")).toContainText("Esha declined the call");
});

test("rules: you can't ring someone who isn't your friend", async ({ browser }) => {
  const [a, b] = [await seedUser("Farah"), await seedUser("Gopal")];
  const pa = await signedIn(browser, a);
  await pa.goto(`/call?to=${b.uid}`);
  await expect(pa.getByTestId("call-ended")).toContainText("You can only call accepted friends");
});

test("screen share: replaces the camera track, peer is told, switches back on stop", async ({ browser }) => {
  const [a, b] = [await seedUser("Hari"), await seedUser("Indu")];
  await makeFriends(a, b);
  const pa = await signedIn(browser, a);
  const pb = await signedIn(browser, b);
  await pa.goto(`/call?to=${b.uid}`);
  await pb.getByRole("button", { name: "Accept" }).click();
  for (const p of [pa, pb]) await expect(p.getByTestId("call-status")).toContainText(/· \d+:\d{2}/, { timeout: 30_000 });

  const sentVideoLabel = () =>
    pa.evaluate(() => {
      // The local preview switches to whatever is being sent.
      const v = document.querySelector<HTMLVideoElement>('[data-testid="local-video"]')!;
      return (v.srcObject as MediaStream).getVideoTracks()[0]?.label ?? "";
    });
  const cameraLabel = await sentVideoLabel();

  await pa.getByRole("button", { name: /Share screen/ }).click();
  await expect(pa.getByText("Pick the YouTube tab to watch together", { exact: false }).first()).toBeVisible();
  await expect(pb.getByText("Hari is sharing their screen")).toBeVisible();
  expect(await sentVideoLabel()).not.toBe(cameraLabel);
  // Frames keep arriving at the callee after the track swap (no renegotiation needed).
  const framesDecoded = () =>
    pb.evaluate(async () => {
      const v = document.querySelector<HTMLVideoElement>('[data-testid="remote-video"]')!;
      return v.getVideoPlaybackQuality().totalVideoFrames;
    });
  const before = await framesDecoded();
  await expect.poll(framesDecoded, { timeout: 10_000 }).toBeGreaterThan(before + 20);
  await pa.screenshot({ path: "test-results/call-sharing.png" });
  await pb.screenshot({ path: "test-results/call-callee.png" });

  await pa.getByRole("button", { name: /Stop sharing/ }).click();
  await expect(pb.getByText("Hari is sharing their screen")).toHaveCount(0);
  expect(await sentVideoLabel()).toBe(cameraLabel);
  await pa.getByTestId("hangup-button").click();
});
