import { defineConfig, devices } from "@playwright/test";

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${playwrightPort}`,
    trace: "on-first-retry",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    },
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${playwrightPort}`,
    url: `http://127.0.0.1:${playwrightPort}`,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
    env: {
      AUTH_SECRET: "investlab-e2e-auth-secret-2026!!",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
