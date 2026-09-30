import { defineConfig, devices } from "@playwright/test";

// Smoke test: `npm run test:smoke` against a local production build, or
// `SMOKE_URL=https://your-app.vercel.app npm run test:smoke` against a deployment.
const SMOKE_URL = process.env.SMOKE_URL;
const PORT = 3105;

export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: SMOKE_URL ?? `http://127.0.0.1:${PORT}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: SMOKE_URL
    ? undefined
    : { command: `npx next build && npx next start -p ${PORT}`, url: `http://127.0.0.1:${PORT}`, timeout: 300_000 },
});
