import { expect, test } from "@playwright/test";

// Runs logged out against real data: needs at least one video in Firestore.

test("home lists videos", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "YourTube" }).or(page.locator('a[href="/"]').first())).toBeVisible();
  await expect(page.locator('a[href^="/watch/"]').first()).toBeVisible();
  // Dark unless it's 10-12 IST in a southern state.
  await expect(page.locator("html")).toHaveClass(/(^|\s)(dark|light)(\s|$)/);
  expect(errors).toEqual([]);
});

test("watch page: custom player with gesture overlay, controls and comments", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const href = await page.locator('a[href^="/watch/"]').first().getAttribute("href");
  await page.goto(href!);

  await expect(page.getByTestId("video-player")).toBeVisible();
  await expect(page.getByTestId("gesture-overlay")).toBeVisible();
  await expect(page.getByTestId("player-controls")).toBeAttached();
  expect(await page.locator("video").first().evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
  // Logged out → Free plan limit chip.
  await expect(page.getByTestId("time-remaining")).toContainText("5:00 left");

  await expect(page.getByTestId("comments")).toBeAttached();
  // Logged-out viewers get a sign-in prompt instead of the form (the sheet on phones).
  const summary = page.getByTestId("comments-summary");
  if (await summary.isVisible()) await summary.click();
  await expect(page.getByTestId("comment-signin-hint")).toBeVisible();
  expect(errors).toEqual([]);
});

test("plans page shows four plans with server prices", async ({ page }) => {
  await page.goto("/plans");
  for (const [id, price] of [["free", "Free"], ["bronze", "₹10"], ["silver", "₹50"], ["gold", "₹100"]]) {
    await expect(page.getByTestId(`plan-${id}`)).toContainText(price);
  }
});

test("public API: geo responds, protected API rejects anonymous", async ({ request }) => {
  const geo = await request.get("/api/geo");
  expect(geo.ok()).toBe(true);
  expect(await geo.json()).toHaveProperty("regionCode");
  expect((await request.post("/api/downloads", { data: { videoId: "x" } })).status()).toBe(401);
  expect((await request.post("/api/payments/create-order", { data: { product: "gold" } })).status()).toBe(401);
});
