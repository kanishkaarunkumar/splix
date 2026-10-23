import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  use: {
    baseURL: process.env.SPLIX_E2E_PREVIEW_URL || "http://127.0.0.1:8081",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        "/opt/google/chrome/chrome",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
});
