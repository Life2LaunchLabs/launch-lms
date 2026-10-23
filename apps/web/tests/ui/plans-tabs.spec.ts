import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

// The signed-in test account administers the seeded org (apps/api/scripts/seed_learner_flow.py).
const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const TABS = ['Assignments', 'Plans', 'Badges', 'Requirements', 'Discover']

const plansTabs = (page: Page) => page.getByRole('navigation', { name: 'Plans pages' }).getByRole('link')

async function tabOrder(page: Page): Promise<string[]> {
  await expect(plansTabs(page)).toHaveCount(5)
  // A tab's first line is its name; a count (Discover requests waiting) follows it.
  return (await plansTabs(page).allInnerTexts()).map((text) => text.trim().split('\n')[0].trim())
}

async function saved(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse((res) => res.url().includes('/goal-admin/preferences/plans-tabs') && res.request().method() === 'PUT')
  await action()
  expect((await response).ok()).toBe(true)
}

async function resetOrder(page: Page) {
  await page.getByRole('button', { name: 'Reorder tabs' }).click()
  const reset = page.getByRole('button', { name: 'Reset to default' })
  if (await reset.isEnabled()) await saved(page, () => reset.click())
  await page.keyboard.press('Escape')
}

test('plans.tabs: Plans holds five tabs, and the order a member sets is kept after reload', async ({ page }) => {
  await page.goto(`${orgPath}/admin/plans`)
  await assertActualApp(page)
  await expect(page.getByText('Plans', { exact: true }).first()).toBeVisible()
  await resetOrder(page)
  const start = await tabOrder(page)
  expect([...start].sort()).toEqual([...TABS].sort())
  await expect(plansTabs(page).filter({ hasText: 'Assignments' })).toHaveAttribute('aria-current', 'page')

  // Move the second tab up: it becomes the first, and stays first after a reload.
  await page.getByRole('button', { name: 'Reorder tabs' }).click()
  await saved(page, () => page.getByRole('button', { name: `Move ${start[1]} up` }).click())
  await page.keyboard.press('Escape')
  const moved = [start[1], start[0], ...start.slice(2)]
  await expect.poll(() => tabOrder(page)).toEqual(moved)
  await page.reload()
  await expect.poll(() => tabOrder(page)).toEqual(moved)

  // Each tab opens its page inside Plans; nothing scrolls sideways.
  await plansTabs(page).filter({ hasText: 'Badges' }).click()
  await expect(page).toHaveURL(/\/admin\/badges$/)
  await expect(plansTabs(page).filter({ hasText: 'Badges' })).toHaveAttribute('aria-current', 'page')
  await plansTabs(page).filter({ hasText: 'Requirements' }).click()
  await expect(page).toHaveURL(/\/admin\/plans\/requirements$/)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  await resetOrder(page)
  await expect.poll(() => tabOrder(page)).toEqual(start)
})

test('plans.library-badges: Plans has search and New plan, a plan opens on its own page, and Badges adds from Discover', async ({ page }) => {
  await page.goto(`${orgPath}/admin/plans/templates`)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'All plans' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search plans' })).toBeVisible()
  // New plan is blank only: shared plans come from Discover.
  await page.getByRole('button', { name: 'New plan' }).first().click()
  await expect(page.getByRole('textbox', { name: 'Plan name' })).toBeVisible()
  await page.keyboard.press('Escape')

  const first = page.getByTestId('plan-card').first()
  if (await first.count()) {
    await first.click()
    await expect(page).toHaveURL(/\/admin\/plans\/[^/]+$/)
    await expect(page.getByTestId('live-version-chip').or(page.getByTestId('plan-draft-bar')).first()).toBeVisible()
  }

  await page.goto(`${orgPath}/admin/badges`)
  await expect(page.getByRole('searchbox', { name: 'Search badges' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create badge' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add from Discover' })).toHaveAttribute('href', /\/admin\/plans\/marketplace\?type=badges$/)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('plans.redirects: the old badge marketplace and framework URLs land in Plans', async ({ page }) => {
  await page.goto(`${orgPath}/admin/badges?tab=marketplace`)
  await assertActualApp(page)
  await expect(page).toHaveURL(/\/admin\/plans\/marketplace\?type=badges$/)
  await expect(plansTabs(page).filter({ hasText: 'Discover' })).toHaveAttribute('aria-current', 'page')

  await page.goto(`${orgPath}/admin/insights/frameworks/${fixture.framework_uuid}/levels`)
  await expect(page).toHaveURL(new RegExp(`/admin/plans/requirements/${fixture.framework_uuid}/levels$`))
})
