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

test('portfolio.access: an expired access-only cookie does not bounce back to Hub', async ({ browser }) => {
  const target = new URL(environment.baseUrl)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expiredAccessToken = `${encode({ alg: 'none' })}.${encode({ exp: 1 })}.unsigned`
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
  })
  await context.addCookies([{
    name: 'access_token_cookie',
    value: expiredAccessToken,
    domain: target.hostname,
    path: '/',
    httpOnly: true,
    secure: target.protocol === 'https:',
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }])
  const page = await context.newPage()

  await page.goto(new URL('/portfolio', target).toString())

  await expect(page).not.toHaveURL((url) => url.pathname === '/hub')
  await expect(page.getByRole('navigation', { name: 'Portfolio views' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /already have an account/i })).toBeVisible()
  await context.close()
})
