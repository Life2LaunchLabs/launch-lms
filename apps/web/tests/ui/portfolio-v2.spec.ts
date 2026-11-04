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
  // The look lives in Settings.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('menuitem', { name: /Look and layout/ }).click()
  return page.getByRole('dialog', { name: 'Your look' })
}

test('portfolio.v2: the owner tries on looks, and opens the profile', async ({ page }) => {
  await page.goto('/portfolio')
  let look = await openLook(page)
  // A look themes the whole app, and the portfolio page carries it for visitors. The arrows try on the next one.
  // Step through until Gallery is on, wherever this learner's look started.
  for (let step = 0; step < 5 && (await page.locator('html').getAttribute('data-look')) !== 'gallery'; step++) {
    const before = await page.locator('html').getAttribute('data-look')
    await look.getByRole('button', { name: 'Next look' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-look', before || '')
  }
  await expect(page.locator('html')).toHaveAttribute('data-look', 'gallery')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-look', 'gallery')
  look = await openLook(page)
  // Light or dark is the learner's call, whatever the look, and an accent stays for visitors. Gallery has no banner.
  await look.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('[data-portfolio-v2]')).not.toHaveClass(/\bdark\b/)
  await look.getByRole('button', { name: 'Accent #16a34a' }).click()
  await expect(page.locator('[data-portfolio-v2]')).toHaveAttribute('data-accent', '')
  await expect(look.getByText(/Gallery has no banner/)).toBeVisible()
  await expect(look.getByRole('button', { name: 'Stripes' })).toHaveCount(0)
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

test('portfolio.v2: the owner moves and takes out sections in place, any time', async ({ page }) => {
  await page.goto('/portfolio')
  await expect(page.getByRole('button', { name: 'Edit page' })).toHaveCount(0)
  // Bio and experience can't be taken out; the rest can, and come back from the adds below. Titles follow the look, so go by section.
  await expect(page.locator('[data-sec="about"]').getByRole('button', { name: /^Take out/ })).toHaveCount(0)
  await page.locator('[data-sec="people"]').hover()
  await page.locator('[data-sec="people"]').getByRole('button', { name: /^Take out/ }).click()
  await expect(page.locator('[data-sec="people"]')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Add a section' }).locator('[data-empty-add]').first()).toBeVisible()
  // Drag About onto the top of the section before it: it gets a row of its own there.
  const order = () => page.locator('[data-sec]:not([hidden])').evaluateAll((all) => all.sort((a, b) => Number((a as HTMLElement).dataset.gr) - Number((b as HTMLElement).dataset.gr) || a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((one) => (one as HTMLElement).dataset.sec))
  const start = await order()
  const before = start[start.indexOf('about') - 1]
  const target = page.locator(`[data-sec="${before}"]`), about = page.locator('[data-sec="about"]')
  await target.evaluate((node) => window.scrollBy(0, node.getBoundingClientRect().top - 120))
  // Only the grip moves a section.
  await about.hover()
  const to = (await target.boundingBox())!, from = (await about.locator('[data-grip]').first().boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + 30, { steps: 4 })
  await expect(page.locator('[data-ph]')).toBeVisible()
  await page.mouse.move(to.x + to.width / 2, to.y + 12, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('[data-ph]')).toHaveCount(0)
  const end = await order()
  expect(end.indexOf('about')).toBeLessThan(end.indexOf(before!))
  // The look's own layout comes back from the look dialog.
  const look = await openLook(page)
  await look.getByRole('button', { name: /^Use .*’s layout$/ }).click()
  await expect(page.locator('[data-sec="people"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
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

test('portfolio.v2: a section’s title opens its page, and its pencil renames it', async ({ page }) => {
  await page.goto('/portfolio')
  const experience = page.locator('[data-sec="experience"]')
  await experience.hover()
  // The pencil makes the title editable; leaving it unchanged keeps the name.
  await experience.getByRole('button', { name: /^Edit the name of / }).click()
  await expect(experience.getByRole('textbox', { name: 'Section title' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(experience.getByRole('textbox', { name: 'Section title' })).toHaveCount(0)
  // Empty space in What I'm like opens its page too.
  await page.locator('[data-sec="results"]').scrollIntoViewIfNeeded()
  // Find a spot inside the tile's body that isn't a link or button of its own, and click it.
  const spot = await page.locator('[data-sec="results"] [data-tile]').evaluate((tile) => {
    const box = tile.getBoundingClientRect()
    for (let y = box.bottom - 6; y > box.top + 60; y -= 8) for (let x = box.left + 6; x < box.right - 6; x += 12) {
      if ((document.elementFromPoint(x, y) as HTMLElement | null)?.hasAttribute('data-tile-link')) return { x, y }
    }
    return null
  })
  expect(spot).not.toBeNull()
  await page.mouse.click(spot!.x, spot!.y)
  await expect(page).toHaveURL(/\/portfolio\/results/)
  await page.goBack()
  await experience.locator('[data-tile-title] a').click()
  await expect(page).toHaveURL(/\/portfolio\/timeline/)
})

test('portfolio.v2: the header has a hover pencil for your details', async ({ page }) => {
  await page.goto('/portfolio')
  await page.locator('[data-pf-name]').hover()
  await page.getByRole('button', { name: 'Edit your details' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
})

test('portfolio.v2: what I’m like has its own page, and adding a result starts with taking the test', async ({ page }) => {
  await page.goto('/portfolio/results')
  await expect(page.getByRole('heading', { name: 'What I’m like', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Add a result' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a result' })
  // Every test says whether it's free or paid, and there's no free-form "name and a line" any more.
  await expect(dialog.getByText('Something else')).toHaveCount(0)
  await dialog.getByRole('button', { name: /CliftonStrengths/ }).click()
  await expect(page.getByRole('link', { name: /Take it on Gallup CliftonStrengths/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Take it on Gallup CliftonStrengths/ }).getByText('Paid')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  // Skills and values are chips you tap, right here.
  await page.getByRole('button', { name: 'Add a result' }).click()
  await page.getByRole('dialog', { name: 'Add a result' }).getByRole('button', { name: /Skills and values/ }).click()
  const chips = page.getByRole('dialog', { name: 'Skills and values' })
  await chips.getByRole('button', { name: 'Focus', exact: true }).click()
  await chips.getByRole('button', { name: 'Honesty', exact: true }).click()
  await chips.getByRole('button', { name: 'Save' }).click()
  const card = page.locator('[data-result-card]', { hasText: 'Skills and values' })
  await expect(card.locator('[data-chip-group="values"]').getByText('Honesty')).toBeVisible()
  await card.getByRole('button', { name: 'Open Skills and values' }).click()
  await page.getByRole('dialog', { name: 'Skills and values' }).getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog', { name: /^Remove Skills and values/ }).getByRole('button', { name: 'Remove' }).click()
  await expect(card).toHaveCount(0)
})
