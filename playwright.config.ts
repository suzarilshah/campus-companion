import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  // Each map test renders the WebGL globe in software; more workers starve frames and slow walks/rides past timeouts.
  workers: 2,
  forbidOnly: true,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:8485', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    env: { PORT: '8485', PROGRESS_FILE: ':memory:' },
    url: 'http://127.0.0.1:8485/api/health',
    reuseExistingServer: false,
  },
});
