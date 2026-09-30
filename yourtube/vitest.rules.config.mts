import { defineConfig } from "vitest/config";

// Run via `npm run test:rules` (wraps this in the Firestore emulator).
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    fileParallelism: false,
  },
});
