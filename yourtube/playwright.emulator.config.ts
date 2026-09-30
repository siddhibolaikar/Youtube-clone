import { defineConfig } from "@playwright/test";

// Multi-user end-to-end tests against the Auth + Firestore emulators.
// Run with `npm run test:e2e` (wraps this in `firebase emulators:exec`).
const PORT = 3104;
const EMU = {
  NEXT_PUBLIC_USE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-yourtube",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-yourtube.firebaseapp.com",
  FIREBASE_PROJECT_ID: "demo-yourtube",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  NEXT_PUBLIC_ENABLE_TEST_OVERRIDES: "true",
  // Never send real email from tests (.env.local has real SMTP credentials).
  MAIL_CAPTURE_DIR: "test-results/mail",
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.e2e\.ts/,
  timeout: 120_000,
  // next dev compiles each route on first hit; allow for that.
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--auto-select-desktop-capture-source=Entire screen",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/geo?testRegion=MH`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { ...(process.env as Record<string, string>), ...EMU },
  },
});
