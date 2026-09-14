import { defineConfig } from '@playwright/test';

// Nutrition regressions run only against a local dev server and intercepted APIs.
const baseURL = 'http://127.0.0.1:18736';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'nutrition-regression.spec.js',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 18736 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'nutrition-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'nutrition-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  ],
});
