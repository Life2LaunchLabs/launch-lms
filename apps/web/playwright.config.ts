import { defineConfig, devices } from '@playwright/test'
import { loadUiTestEnvironment } from './tests/ui/environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/ui/global.setup.ts',
  outputDir: environment.outputDir,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }], ['./tests/ui/run-manifest-reporter.ts']]
    : [['list'], ['./tests/ui/run-manifest-reporter.ts']],
  use: {
    baseURL: environment.baseUrl,
    storageState: '.playwright/auth/learner.json',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'webkit-phone-smoke', testMatch: '**/mobile-smoke.spec.ts', use: { ...devices['iPhone 13'] } },
  ],
})
