import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

async function expectPortfolio(page: import('@playwright/test').Page) {
  await expect(page).toHaveURL((url) => url.pathname === '/portfolio')
  await expect(page.getByRole('navigation', { name: 'Portfolio views' })).toBeVisible()
  await assertActualApp(page)
}

test('portfolio.access: authenticated learner navigation and refresh stay in Portfolio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 551 })
  await page.goto(environment.hubPath)
  await assertActualApp(page)

  await page.getByRole('link', { name: 'Portfolio', exact: true }).first().click()
  await expectPortfolio(page)

  await page.reload()
  await expectPortfolio(page)
})

test('portfolio.access: direct authenticated navigation stays in Portfolio', async ({ page }) => {
  await page.goto('/portfolio')
  await expectPortfolio(page)
})

test('portfolio.access: unauthenticated navigation uses the safe organization fallback', async ({ browser }) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await page.goto(new URL('/portfolio', environment.baseUrl).toString())
  await expect(page.getByRole('navigation', { name: 'Portfolio views' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /welcome back|sign in/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /already have an account/i })).toBeVisible()
  await context.close()
})
