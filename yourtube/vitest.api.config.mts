import { defineConfig } from "vitest/config";

// Run via `npm run test:api`: boots `next dev` against the Auth + Firestore
// emulators and exercises the API routes over HTTP.
export default defineConfig({
  test: {
    include: ["tests/api/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
