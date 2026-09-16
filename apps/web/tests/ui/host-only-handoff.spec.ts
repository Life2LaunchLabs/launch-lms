import { expect, test } from '@playwright/test'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })
const hostOnly = process.env.NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE === 'host-only'

test('host-only login hands off to the installation root without sharing auth cookies', async ({ page }) => {
  test.skip(!hostOnly, 'Only the host-only browser lane exercises this protocol')

  const source = new URL(environment.baseUrl)
  const rootHost = process.env.UI_TEST_PUBLIC_HOST || 'unstable.127.0.0.1.sslip.io'
  const legacyDomain = process.env.NEXT_PUBLIC_LAUNCHLMS_LEGACY_COOKIE_DOMAIN || ''
  expect(source.hostname).toBe(`life2launch.${rootHost}`)
  expect(rootHost.endsWith(`.${legacyDomain}`)).toBe(true)
  const target = new URL(source)
  target.hostname = rootHost

  const before = await page.context().cookies()
  expect(before.some(cookie => cookie.name === 'refresh_token_cookie' && cookie.domain === source.hostname)).toBe(true)
  expect(before.some(cookie => cookie.name === 'refresh_token_cookie' && cookie.domain === target.hostname)).toBe(false)

  await page.context().addCookies([{
    name: 'launchlms_current_orgslug', value: 'legacy', domain: `.${legacyDomain}`, path: '/',
  }])

  const requestUrls: string[] = []
  page.on('request', request => requestUrls.push(request.url()))
  const completed = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/auth/handoff/complete' && request.method() === 'POST')
  const start = new URL('/api/auth/handoff/start', target)
  start.searchParams.set('source', source.host)
  start.searchParams.set('return', '/account')
  await page.goto(start.toString())
  const completion = await completed
  await expect(page).toHaveURL(url => url.origin === target.origin && url.pathname === '/account')
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
  expect(await page.evaluate(() =>
    (window as Window & { __RUNTIME_CONFIG__?: Record<string, string> })
      .__RUNTIME_CONFIG__?.NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE)).toBe('host-only')

  const after = await page.context().cookies()
  for (const name of ['access_token_cookie', 'refresh_token_cookie']) {
    expect(after.some(cookie => cookie.name === name && cookie.domain === source.hostname)).toBe(true)
    expect(after.some(cookie => cookie.name === name && cookie.domain === target.hostname)).toBe(true)
    expect(after.some(cookie => cookie.name === name && cookie.domain.startsWith('.'))).toBe(false)
  }
  expect(after.some(cookie => cookie.name === 'launchlms_current_orgslug' && cookie.domain === `.${legacyDomain}`)).toBe(false)
  expect(requestUrls.every(url => {
    const query = new URL(url).searchParams
    return !['ticket', 'access_token', 'refresh_token'].some(name => query.has(name))
  })).toBe(true)

  const replay = await page.request.post(new URL('/api/auth/handoff/complete', target).toString(), {
    data: completion.postData() || '',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  expect(replay.status()).toBe(401)
})
