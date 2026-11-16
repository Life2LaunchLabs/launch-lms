import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

// The signed-in test account administers the seeded org (apps/api/scripts/seed_learner_flow.py). The org may already
// track frameworks from earlier specs, so this works from either state.
const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const EPP = 'Oregon Education Plan and Profile (EPP)'

async function capture(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ path: info.outputPath(name), fullPage: true })
  await info.attach(`synthetic-review:${name}`, { body: screenshot, contentType: 'image/png' })
}

test('requirements.tracking: staff find Oregon’s EPP from Insights, track it, and get its framework dashboards', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto(`${orgPath}/admin/plans`)
  await assertActualApp(page)
  // Requirements is always a Plans tab, even before the org tracks a framework.
  await expect(page.getByRole('navigation', { name: 'Plans pages' }).getByRole('link', { name: 'Requirements' })).toBeVisible()

  // With no framework tracked, the framework dashboards say how to track one; otherwise they open the first one.
  await page.goto(`${orgPath}/admin/insights/framework`)
  const empty = page.getByRole('link', { name: 'Track a framework' })
  await expect(empty.or(page.getByRole('button', { name: 'Switch requirement framework' })).first()).toBeVisible()
  if (await empty.isVisible()) {
    await capture(page, testInfo, 'insights-framework-empty.png')
    await empty.click()
    await expect(page).toHaveURL(/\/admin\/plans\/discover#frameworks$/)
  } else {
    await page.goto(`${orgPath}/admin/plans/discover`)
  }

  // Discover search finds the framework by what a counselor would type.
  await page.getByRole('textbox', { name: 'Search Discover' }).fill('education plan')
  const frameworks = page.getByRole('region', { name: 'Requirement frameworks' })
  const card = frameworks.locator('div', { hasText: EPP }).last()
  await expect(card).toBeVisible()
  await capture(page, testInfo, 'discover-framework-search.png')
  const track = card.getByRole('button', { name: 'Track' })
  if (await track.isVisible()) await track.click()
  else await card.getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/admin\/plans\/requirements\/[^/]+\/plans$/)
  await expect(page.getByText(EPP).first()).toBeVisible()

  // Its Insights dashboards are there now.
  await page.goto(`${orgPath}/admin/insights/framework`)
  await page.getByRole('button', { name: 'Switch requirement framework' }).click()
  await expect(page.getByRole('menuitem', { name: new RegExp(EPP.replace(/[()]/g, '\\$&')) })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: 'Track a framework' })).toHaveCount(0)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 })
  await capture(page, testInfo, 'insights-framework-epp.png')
})
