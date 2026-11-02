import path from 'node:path'
import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'

// The portfolio front page and its section pages.

// The menu sits at the top of the cover, where the guest notice can cover it, so it's opened from the keyboard.
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).first().focus()
  await page.keyboard.press('Enter')
}

test('portfolio.v2: the portfolio is the new one, with no switch', async ({ page }) => {
  await page.goto('/portfolio')
  await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
  await assertActualApp(page)
  await expect(page.getByText('Try the new portfolio.')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'About me' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Experience' })).toBeVisible()
})

async function openLook(page: import('@playwright/test').Page) {
  await openSettings(page)
  await page.getByRole('menuitem', { name: 'Look and layout' }).click()
  return page.getByRole('dialog', { name: 'Your look' })
}

test('portfolio.v2: the owner changes the layout and look, and opens the profile', async ({ page }) => {
  await page.goto('/portfolio')
  const sections = page.locator('[data-layout]')
  let look = await openLook(page)
  await look.getByRole('button', { name: 'List' }).click()
  await expect(sections).toHaveAttribute('data-layout', 'list')
  // A look themes the whole app, and the portfolio page carries it for visitors.
  await look.getByRole('button', { name: /^Midnight/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'midnight')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(sections).toHaveAttribute('data-layout', 'list')
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-look', 'midnight')
  look = await openLook(page)
  await look.getByRole('button', { name: 'Grid' }).click()
  await expect(sections).toHaveAttribute('data-layout', 'grid')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  await expect(page.getByRole('dialog', { name: 'Your profile' })).toBeVisible()
  await expect(page.getByLabel(/Name you go by/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('portfolio.v2: the visitor preview and phone width', async ({ page }) => {
  await page.goto('/portfolio/preview')
  await expect(page.getByText('Visitor preview')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit your profile' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/portfolio')
  await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('portfolio.v2: section pages have one-row headers and row controls', async ({ page }) => {
  // Three pages compile on first visit in development.
  test.setTimeout(90_000)
  for (const [path, title] of [['/portfolio/timeline', 'Experience'], ['/portfolio/projects', 'Projects'], ['/portfolio/badges', 'Credentials & badges']]) {
    await page.goto(`${path}`)
    await expect(page.locator('[data-portfolio-v2]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to your portfolio' })).toBeVisible()
  }
  await page.goto('/portfolio/timeline')
  const star = page.getByRole('button', { name: /^(Feature .* on your front page|Stop featuring .*)$/ }).first()
  if (await star.count()) {
    const before = await star.getAttribute('aria-pressed')
    await star.click()
    await expect(page.getByRole('button', { name: /^(Feature .* on your front page|Stop featuring .*)$/ }).first()).not.toHaveAttribute('aria-pressed', before || '')
    await page.getByRole('button', { name: /^(Feature .* on your front page|Stop featuring .*)$/ }).first().click()
  }
  await page.goto('/portfolio/timeline?experience=education')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('portfolio.v2: editors for credentials, people, documents and results open from their pages', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/portfolio/badges?add=credential')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('radio', { name: /Test score/ }).click()
  await expect(page.getByRole('switch', { name: 'Show to visitors' })).toBeDisabled()
  await page.keyboard.press('Escape')

  await page.goto('/portfolio/people')
  await expect(page.getByRole('heading', { level: 1, name: 'My people' })).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel(/Email/)).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/portfolio/documents')
  await expect(page.getByRole('heading', { level: 1, name: 'My documents' })).toBeVisible()

  await page.goto('/portfolio')
  await expect(page.getByRole('region', { name: 'What I’m like' })).toBeVisible()
  await page.getByRole('button', { name: /Edit links|Add links/ }).click()
  await expect(page.getByRole('dialog', { name: 'Your links' })).toBeVisible()
})

test('portfolio.v2: the résumé builder makes a letter page from the portfolio', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/portfolio/resume')
  await expect(page.getByRole('heading', { level: 1, name: 'Résumé' })).toBeVisible()
  await expect(page.locator('[data-resume-paper]').first()).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/one page/)
  const layout = page.getByRole('group', { name: 'Layout' })
  await layout.getByRole('button', { name: 'Compact' }).click()
  await expect(layout.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
  await layout.getByRole('button', { name: 'Classic' }).click()
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()?.width || 0)
})

test('portfolio.v2: an Oregon CIS export is previewed and brought in', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/portfolio/import')
  await expect(page.getByRole('heading', { name: 'Bring in your history' })).toBeVisible()
  await page.getByLabel('Oregon CIS export').setInputFiles(path.join(__dirname, 'fixtures', 'oregon-cis-export.zip'))
  await expect(page.getByText('Animal Care Helper')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Interest Profiler Short Form (Oregon CIS)')).toBeVisible()
  await expect(page.getByText(/Can't bring in notes\.txt/)).toBeVisible()
  const bringIn = page.getByRole('button', { name: /^Bring in \d+$/ })
  // A second run against the same account finds everything already there.
  if (await bringIn.isEnabled()) {
    await bringIn.click()
    await expect(page.getByRole('heading', { name: /Added \d+ things? to your portfolio/ })).toBeVisible()
  } else {
    await expect(page.getByText('Already in your portfolio').first()).toBeVisible()
  }
  await assertActualApp(page)
})

test('portfolio.v2: a résumé PDF is read into a pick list', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/portfolio/import')
  await page.getByLabel('A résumé export').setInputFiles(path.join(__dirname, 'fixtures', 'resume.pdf'))
  await expect(page.getByText(/what we found in your résumé/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Barista', { exact: true })).toBeVisible()
  await expect(page.getByText('Résumé (resume)')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Upload a résumé' })).toBeVisible()
})
