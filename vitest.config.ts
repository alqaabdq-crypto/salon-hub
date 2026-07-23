import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only `src/**/*.test.ts` is collected: node_modules ships thousands of its own
// test files, and the default include pattern would walk into them.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
