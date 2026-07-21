import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 6_000 },
  reporter: [['list']],
  outputDir: '../../output/playwright/results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5174/pos-pilot/',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    // Exercise the exact immutable assets shipped by Express. The Vite dev
    // server can stall while transforming files in cloud-synchronised
    // worktrees, and a production preview is a closer deployment contract.
    command: 'npm run build:pos-pilot && npx vite preview --config client/pos-pilot/vite.config.ts --host 127.0.0.1 --port 5174',
    cwd: '../..',
    url: 'http://127.0.0.1:5174/pos-pilot/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
