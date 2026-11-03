import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { loginNormally } from './auth'
import { loadUiTestEnvironment } from './environment'

export default async function globalSetup(): Promise<void> {
  const environment = loadUiTestEnvironment()
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: environment.baseUrl, ignoreHTTPSErrors: true })
  try {
    await loginNormally(page, environment)
    await expect(page).not.toHaveURL(/\/(?:auth\/)?login/)
    // The portfolio's one-time welcome sheet would sit over every spec that opens the portfolio.
    await page.evaluate(() => window.localStorage.setItem('portfolio-welcome-seen', '1'))
    mkdirSync('.playwright/auth', { recursive: true })
    await page.context().storageState({ path: '.playwright/auth/learner.json' })
  } finally {
    await browser.close()
  }
}
