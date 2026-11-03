import path from 'node:path'
import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'

// The portfolio front page and its section pages.

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
  await page.getByRole('button', { name: 'Look', exact: true }).focus()
  await page.keyboard.press('Enter')
  return page.getByRole('dialog', { name: 'Your look' })
}

test('portfolio.v2: the owner tries on looks, and opens the profile', async ({ page }) => {
  await page.goto('/portfolio')
  let look = await openLook(page)
  // A look themes the whole app, and the portfolio page carries it for visitors. The arrows try on the next one.
  await look.getByRole('button', { name: 'Next look' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'gallery')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-look', 'gallery')
  look = await openLook(page)
  // Light or dark is the learner's call, whatever the look; an accent and a banner pattern stay for visitors.
  await look.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('[data-portfolio-v2]')).not.toHaveClass(/\bdark\b/)
  await look.getByRole('button', { name: 'Accent #16a34a' }).click()
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-accent', '')
  await look.getByRole('button', { name: 'Stripes' }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('[data-portfolio-v2]')).not.toHaveClass(/\bdark\b/)
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-accent', '')

  await page.getByRole('button', { name: 'Edit your profile' }).click()
  await expect(page.getByRole('dialog', { name: 'Your profile' })).toBeVisible()
  await expect(page.getByLabel(/Name you go by/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('portfolio.v2: edit page moves, takes out and renames sections in place', async ({ page }) => {
  await page.goto('/portfolio')
  await page.getByRole('button', { name: 'Edit page' }).click()
  await expect(page.getByRole('toolbar', { name: 'Edit page' })).toBeVisible()
  // Bio and experience can't be taken out; the rest can, and come back from "Add a section".
  await expect(page.getByRole('button', { name: /^Take out About/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Take out Where/ }).click()
  await expect(page.locator('[data-sec="headed"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Use .* suggested layout$/ })).toBeVisible()
  // Drag projects onto the top of experience: it gets its own row there.
  const projects = page.locator('[data-sec="projects"]'), experience = page.locator('[data-sec="experience"]')
  const from = (await projects.boundingBox())!, to = (await experience.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + 40)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + 80, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + 12, { steps: 12 })
  await expect(page.locator('[data-ph]')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('[data-ph]')).toHaveCount(0)
  await page.getByRole('button', { name: /^Use .* suggested layout$/ }).click()
  await expect(page.locator('[data-sec="headed"]')).toHaveCount(1)
  await page.getByRole('toolbar', { name: 'Edit page' }).getByRole('button', { name: 'Done' }).click()
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
  // Older links that opened an editor land on the new experience page, made in place.
  await page.goto('/portfolio/timeline?experience=education')
  await expect(page).toHaveURL(/\/portfolio\/timeline\/new\?type=education/)
  await expect(page.getByLabel('Type')).toHaveValue('education')
  await expect(page.getByRole('button', { name: 'Add to my portfolio' })).toBeVisible()
})

test('portfolio.v2: editors for credentials, people, documents and results open from their pages', async ({ page }) => {
  test.setTimeout(90_000)
  // Cards and certificates wait until they can be checked; badges are what count for now.
  await page.goto('/portfolio/badges')
  await expect(page.getByText('Coming soon: cards and certificates')).toBeVisible()

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
  await page.getByRole('button', { name: /Edit links|Add where people can find you/ }).click()
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
