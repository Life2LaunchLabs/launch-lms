import { expect, test, type Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

// DEV-26: a learner's pages load no analytics, ad, tracking or third-party font or script.
// Code and styles come only from our own hosts. Pictures and videos a plan or resource links to
// (content the organization chose) may come from elsewhere, so images and media are not judged here.
const environment = loadUiTestEnvironment({ requireCredentials: false })
const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const goalId: string = fixture.goal_uuid || fixture.plan_uuid || fixture.plan_slug

const TRACKERS = /umami|google-analytics|googletagmanager|doubleclick|fonts\.googleapis|fonts\.gstatic|segment\.(io|com)|hotjar|mixpanel|posthog|plausible|clarity\.ms|facebook\.net|connect\.facebook|amplitude|fullstory|heap(analytics)?\.|intercom/i
const JUDGED = new Set(['script', 'stylesheet', 'font', 'xhr', 'fetch', 'eventsource', 'websocket', 'ping', 'other'])

function ownHosts(): string[] {
  const hosts = [new URL(environment.baseUrl).hostname, 'localhost', '127.0.0.1']
  for (const value of [process.env.NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL, process.env.UI_TEST_PUBLIC_HOST, process.env.NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN]) {
    if (!value) continue
    try { hosts.push(new URL(value.includes('://') ? value : `http://${value}`).hostname) } catch { /* not a host */ }
  }
  return hosts
}

function isOwn(host: string, own: string[]) {
  return own.some((mine) => host === mine || host.endsWith(`.${mine}`))
}

const PAGES = [
  ['front page', '/'],
  ['home', orgPath],
  ['plans', `${orgPath}/plans`],
  ['plan', `${orgPath}/plans/${goalId}`],
  ['portfolio', `${orgPath}/portfolio`],
  ['discover', `${orgPath}/discover`],
] as const

test('privacy.third-party: learner pages load no tracking, ads or outside scripts and fonts', async ({ page }) => {
  test.setTimeout(90_000)
  const own = ownHosts()
  const outside: string[] = []
  const record = (request: Request) => {
    const url = new URL(request.url())
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return
    if (TRACKERS.test(url.hostname) || TRACKERS.test(url.pathname)) { outside.push(`${request.resourceType()} ${url.origin}${url.pathname}`); return }
    if (isOwn(url.hostname, own)) return
    if (JUDGED.has(request.resourceType())) outside.push(`${request.resourceType()} ${url.origin}${url.pathname}`)
  }
  page.on('request', record)
  for (const [, path] of PAGES) {
    await page.goto(path)
    await assertActualApp(page)
    await page.waitForLoadState('networkidle').catch(() => undefined)
  }
  page.off('request', record)
  expect(outside, `Requests that left our own hosts:\n${outside.join('\n')}`).toEqual([])
  // The text face is our own copy, not a fallback.
  expect(await page.evaluate(async () => (await document.fonts.load("16px 'Wix Madefor Text'")).length)).toBeGreaterThan(0)
})
