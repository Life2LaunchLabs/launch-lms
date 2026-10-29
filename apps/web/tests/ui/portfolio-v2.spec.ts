import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'

// The new portfolio front page, behind its preview switch.

// The menu sits at the top of the cover, where the guest notice can cover it, so it's opened from the keyboard.
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).first().focus()
  await page.keyboard.press('Enter')
}

test('portfolio.v2: the switch opens the new portfolio and keeps the choice', async ({ page }) => {
  await page.goto('/portfolio?new=0')
  await expect(page.getByText('Try the new portfolio.')).toBeVisible()
  // The guest notice can sit over the top of the page for an account outside the organization.
  await page.goto(`/portfolio${await page.getByRole('link', { name: 'Try it' }).getAttribute('href')}`)
  await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
  await assertActualApp(page)

  await page.goto('/portfolio')
  await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'About me' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Experience' })).toBeVisible()
})

test('portfolio.v2: the owner changes the layout and opens the profile', async ({ page }) => {
  await page.goto('/portfolio?new=1')
  const sections = page.locator('[data-layout]')
  await openSettings(page)
  await page.getByRole('menuitem', { name: 'List' }).click()
  await expect(sections).toHaveAttribute('data-layout', 'list')
  await page.reload()
  await expect(sections).toHaveAttribute('data-layout', 'list')
  await openSettings(page)
  await page.getByRole('menuitem', { name: 'Grid' }).click()
  await expect(sections).toHaveAttribute('data-layout', 'grid')

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  await expect(page.getByRole('dialog', { name: 'Your profile' })).toBeVisible()
  await expect(page.getByLabel(/Name you go by/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('portfolio.v2: the visitor preview and phone width', async ({ page }) => {
  await page.goto('/portfolio/preview?new=1')
  await expect(page.getByText('Visitor preview')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit your profile' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/portfolio?new=1')
  await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
