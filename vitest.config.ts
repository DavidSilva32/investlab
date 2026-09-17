import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: { alias: { "@": path.join(rootDirectory, "src") } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [
      ["tests/components/**/*.test.tsx", "jsdom"],
      ["tests/app/**/*.test.tsx", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      reportsDirectory: "coverage",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
