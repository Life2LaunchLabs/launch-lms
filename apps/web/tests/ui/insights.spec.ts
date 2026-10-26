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

/** The dashboards rail; on a phone it sits behind a toggle, so open it first. */
async function rail(page: Page) {
  const toggle = page.getByRole('button', { name: 'All dashboards and reports' })
  const nav = page.getByRole('navigation', { name: 'Dashboards' })
  await expect(toggle.or(nav).first()).toBeVisible()
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  return nav
}

test('insights.dashboards: the org overview runs its cards, opens who is behind a number, and changes dates', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'Org overview', level: 1 })).toBeVisible()
  await expect((await rail(page)).getByRole('link', { name: 'Org overview' })).toHaveAttribute('aria-current', 'page')
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
  // Every project and retry shares the database, so each run names its own dashboard.
  const name = `Badge check ${Date.now().toString(36)}`
  await page.goto(insightsPath)
  await assertActualApp(page)
  await (await rail(page)).getByRole('button', { name: 'New dashboard' }).click()
  const dialog = page.getByRole('dialog', { name: 'New dashboard' })
  await dialog.getByRole('button', { name: /^Plan/ }).click()
  await dialog.getByRole('button', { name: /Badge issuing/ }).click()
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name)
  await dialog.getByRole('button', { name: 'Make dashboard' }).click()
  await expect(page).toHaveURL(/\/admin\/insights\/plan\?d=dashboard_/)
  await expect(page.getByRole('navigation', { name: 'Plan dashboards' }).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
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

test('insights.captures: Capture keeps the dashboard with a note, the log lists it, and its read-only link opens signed out', async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await expect(cards(page).first()).toBeVisible()
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Capture this dashboard' })
  await dialog.getByRole('textbox', { name: 'Note' }).fill('End of term check')
  await dialog.getByRole('button', { name: 'Capture', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/insights\/captures\/capture_/)
  await expect(page.getByText('End of term check')).toBeVisible()
  await expect(cards(page).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'See who' })).toHaveCount(0)
  await capture(page, testInfo, 'insights-capture.png')

  const share = page.getByRole('region', { name: 'Read-only link' })
  await share.getByRole('button', { name: 'Make a link' }).click()
  const link = await share.getByRole('textbox', { name: 'Link' }).inputValue()
  expect(link).toContain('/insights/shared/')

  await (await rail(page)).getByRole('link', { name: 'Captures' }).click()
  await expect(page.getByRole('heading', { name: 'Captures', level: 1 })).toBeVisible()
  await expect(page.getByTestId('capture-row').first()).toContainText('End of term check')

  const outside = await browser.newContext({ storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: true })
  const visitor = await outside.newPage()
  await visitor.goto(link)
  await expect(visitor.getByText('End of term check')).toBeVisible()
  await expect(visitor.getByTestId('insight-card').first()).toBeVisible()
  await expect(visitor.getByRole('button', { name: 'See who' })).toHaveCount(0)
  await capture(visitor, testInfo, 'insights-capture-shared.png')
  await outside.close()
})

test('insights.schedules: a dashboard schedules weekly captures, and Run now captures straight away', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await expect(cards(page).first()).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Schedule captures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Scheduled captures' })
  if (await dialog.getByRole('button', { name: 'New schedule' }).isVisible()) await dialog.getByRole('button', { name: 'New schedule' }).click()
  await dialog.getByRole('combobox', { name: 'How often' }).selectOption('weekly')
  await dialog.getByRole('combobox', { name: 'Day of the week' }).selectOption('4')
  const note = `Friday check ${Date.now().toString(36)}`
  await dialog.getByRole('textbox', { name: 'Note' }).fill(note)
  await dialog.getByRole('button', { name: 'Schedule', exact: true }).click()
  const row = dialog.getByTestId('schedule-row').filter({ hasText: note })
  await expect(row).toContainText('Every Friday')
  await row.getByRole('button', { name: 'Run now' }).click()
  await expect(page).toHaveURL(/\/admin\/insights\/captures\/capture_/)
  await expect(page.getByText(note)).toBeVisible()
  await expect(page.getByText(/on a schedule/)).toBeVisible()
})

test('insights.learner: a learner dashboard opens from the rail, runs its cards and switches learners', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(insightsPath)
  await assertActualApp(page)
  await (await rail(page)).getByRole('link', { name: /Learners/ }).click()
  await expect(page.getByRole('button', { name: 'Switch learner' })).toBeVisible()
  const views = page.getByRole('navigation', { name: 'Learner dashboards' })
  await expect(views.getByRole('link', { name: 'Learner overview' })).toHaveAttribute('aria-current', 'page')
  await expect(cards(page).first()).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  expect(await cards(page).count()).toBeGreaterThanOrEqual(8)
  await capture(page, testInfo, 'insights-learner.png')

  await page.getByRole('button', { name: 'Switch learner' }).click()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
