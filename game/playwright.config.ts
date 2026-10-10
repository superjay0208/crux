import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
  },
  projects: [
    {
      name: process.env.CRUX_CI === '1' ? 'chromium' : 'msedge',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.CRUX_CI === '1' ? undefined : 'msedge',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: process.env.CRUX_PRODUCTION === '1'
      ? 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort'
      : 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 15000,
  },
});

