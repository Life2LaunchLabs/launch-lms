import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

// The signed-in test account administers the seeded org (apps/api/scripts/seed_learner_flow.py).
const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`

const plansTabs = (page: Page) => page.getByRole('navigation', { name: 'Plans pages' }).getByRole('link')

async function tabNames(page: Page): Promise<string[]> {
  // A tab's text is its name, then its count when it has one.
  return (await plansTabs(page).allInnerTexts()).map((text) => text.trim().replace(/\s*\d+$/, ''))
}

test('plans.tabs: Plans opens on the org’s plans, with Plans and Discover first and no Badges tab', async ({ page }) => {
  await page.goto(`${orgPath}/admin/plans`)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'Plans', level: 1 })).toBeVisible()
  await expect(plansTabs(page).first()).toBeVisible()
  const names = await tabNames(page)
  expect(names.slice(0, 2)).toEqual(['Plans', 'Discover'])
  expect(names).not.toContain('Badges')
  for (const name of names.slice(2)) expect(['Assignments', 'Requirements']).toContain(name)
  await expect(plansTabs(page).filter({ hasText: 'Plans' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Reorder tabs' })).toHaveCount(0)

  await plansTabs(page).filter({ hasText: 'Discover' }).click()
  await expect(page).toHaveURL(/\/admin\/plans\/discover$/)
  await expect(plansTabs(page).filter({ hasText: 'Discover' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('plans.library: Plans has search and New plan, and a plan opens on its own page', async ({ page }) => {
  await page.goto(`${orgPath}/admin/plans`)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'All plans' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search plans' })).toBeVisible()
  await page.getByRole('button', { name: 'New plan' }).first().click()
  await expect(page.getByRole('textbox', { name: 'Plan name' })).toBeVisible()
  await page.keyboard.press('Escape')

  const first = page.getByTestId('plan-card').first()
  if (await first.count()) {
    await first.click()
    await expect(page).toHaveURL(/\/admin\/plans\/[^/]+$/)
    await expect(page.getByTestId('live-version-chip').or(page.getByTestId('plan-draft-bar')).first()).toBeVisible()
  }
})

test('plans.redirects: old Templates, Marketplace, Badges and framework URLs land in Plans', async ({ page }) => {
  await page.goto(`${orgPath}/admin/badges`)
  await assertActualApp(page)
  await expect(page).toHaveURL(/\/admin\/plans$/)

  await page.goto(`${orgPath}/admin/plans/templates`)
  await expect(page).toHaveURL(/\/admin\/plans$/)

  await page.goto(`${orgPath}/admin/plans/marketplace`)
  await expect(page).toHaveURL(/\/admin\/plans\/discover$/)
  await expect(plansTabs(page).filter({ hasText: 'Discover' })).toHaveAttribute('aria-current', 'page')

  await page.goto(`${orgPath}/admin/insights/frameworks/${fixture.framework_uuid}/levels`)
  await expect(page).toHaveURL(new RegExp(`/admin/plans/requirements/${fixture.framework_uuid}/levels$`))
})
