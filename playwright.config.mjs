import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".artifacts/playwright-results",
  workers: 1,
  retries: 0,
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3123",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "/usr/local/bin/node tests/fixtures/openai-server.mjs",
      url: "http://127.0.0.1:9011/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "/usr/local/bin/npm run start -- --hostname 127.0.0.1 --port 3123",
      url: "http://127.0.0.1:3123",
      env: {
        OPENAI_API_KEY: "e2e-fixture-key",
        OPENAI_BASE_URL: "http://127.0.0.1:9011/v1",
        OPENAI_MODEL: "fixture"
      },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
