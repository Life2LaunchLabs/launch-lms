import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

// The seeded org has a group on an assignment (apps/api/scripts/seed_requirement_evidence.py); Insights makes its
// starter dashboards the first time it is opened.
const fixture = JSON.parse(readFileSync('.playwright/requirement-evidence.json', 'utf8'))
const insightsPath = `/orgs/${fixture.org_slug}/admin/insights`

async function capture(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ path: info.outputPath(name), fullPage: true })
  await info.attach(`synthetic-review:${name}`, { body: screenshot, contentType: 'image/png' })
}

const cards = (page: Page) => page.getByTestId('insight-card')

test('insights.dashboards: the org overview runs its cards, opens who is behind a number, and changes dates', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'Org overview', level: 1 })).toBeVisible()
  const rail = page.getByRole('navigation', { name: 'Dashboards' })
  await expect(rail.getByRole('link', { name: 'Org overview' })).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).first()).toBeVisible()
  expect(await cards(page).count()).toBeGreaterThanOrEqual(6)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await capture(page, testInfo, 'insights-org-overview.png')

  await page.getByRole('button', { name: 'See who' }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText(/learners?\b|Nobody here/).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  const year = page.getByRole('group', { name: 'Dates' }).getByRole('button', { name: '12 months' })
  await year.click()
  await expect(year).toHaveAttribute('aria-pressed', 'true')
  await expect(cards(page).first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('insights.scopes: a group dashboard switches groups and lists its views; old report links still land', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(`${insightsPath}/group`)
  await assertActualApp(page)
  await expect(page.getByRole('button', { name: 'Switch group' })).toBeVisible()
  const views = page.getByRole('navigation', { name: 'Group dashboards' })
  await expect(views.getByRole('link', { name: 'Group progress' })).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).first()).toBeVisible()
  await capture(page, testInfo, 'insights-group.png')

  await page.goto(`${insightsPath}?group=${fixture.group_id}`)
  await expect(page).toHaveURL(new RegExp(`/admin/insights/reports\\?group=${fixture.group_id}`))
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveValue(String(fixture.group_id))
})

test('insights.new: New dashboard makes a personal one from a template, and editing adds a card from the library', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await page.getByRole('navigation', { name: 'Dashboards' }).getByRole('button', { name: 'New dashboard' }).click()
  const dialog = page.getByRole('dialog', { name: 'New dashboard' })
  await dialog.getByRole('button', { name: /^Plan/ }).click()
  await dialog.getByRole('button', { name: /Badge issuing/ }).click()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Badge check')
  await dialog.getByRole('button', { name: 'Make dashboard' }).click()
  await expect(page).toHaveURL(/\/admin\/insights\/plan\?d=dashboard_/)
  await expect(page.getByRole('navigation', { name: 'Plan dashboards' }).getByRole('link', { name: 'Badge check' })).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).first()).toBeVisible()
  const before = await cards(page).count()

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: /Add a card/ }).click()
  const editor = page.getByRole('dialog', { name: 'Add a card' })
  await editor.getByRole('button', { name: 'How many plans are finished each week?' }).click()
  await expect(editor.getByRole('combobox', { name: 'Show' })).toHaveValue('plans_finished')
  await expect(editor.getByTestId('insight-card')).toBeVisible()
  await editor.getByRole('button', { name: 'Add card' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(cards(page)).toHaveCount(before + 1)
})
