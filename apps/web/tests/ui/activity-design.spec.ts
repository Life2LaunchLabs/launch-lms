import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))

const text = (id: string, value: string) => ({ id, type: 'text', content: { nodes: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] } })

// One activity that uses the design language: a dark default background with a scene, a labelled
// exit, a footer button, a light page of its own with card choices, and a celebration at the end.
const document = {
  format: 'launch-lms.activity',
  format_version: 1,
  activity: { title: 'Design language check', settings: { design: { background: { color: '#0f172a', scene: 'starfield' }, exit: { label: 'Save for later' } } } },
  pages: [
    { page_uuid: 'intro', title: 'Intro', content: { version: 2, blocks: [text('blk_welcome', 'Welcome aboard'), { id: 'blk_skip', type: 'button', design: { placement: 'footer' }, content: { label: 'Skip ahead', action: 'continue' } }] } },
    { page_uuid: 'pick', title: 'Pick', design: { background: { color: '#fef3c7' } }, content: { version: 2, blocks: [
      text('blk_ask', 'Pick a pace'),
      { id: 'blk_pace', type: 'question', kind: 'multiple_choice', design: { style: 'cards' },
        content: { options: [{ id: 'calm', text: 'Calm', icon: '🌊', description: 'Slow and steady' }, { id: 'quick', text: 'Quick', icon: '⚡', description: 'Short bursts' }] },
        scoring: { mode: 'off', points: 0, correct_option_ids: [] }, completion: { min_selections: 1, max_selections: 1 } },
    ] } },
    { page_uuid: 'done', title: 'Done', design: { celebrate: true }, content: { version: 2, blocks: [text('blk_done', 'All set')] } },
  ],
}

test('activity.design: backgrounds, footer buttons, Back, exit and card choices play in every activity', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))

  const signedIn = page.waitForResponse((response) => response.url().includes('/api/v1/') && Boolean(response.request().headers().authorization))
  await page.goto(`/orgs/${fixture.org_slug}/plans`)
  await assertActualApp(page)
  const response = await signedIn
  const authorization = response.request().headers().authorization
  const api = response.url().split('/api/v1/')[0] + '/api/v1/'
  const created = await page.request.post(`${api}learning-previews/`, { headers: { authorization }, data: { activity_uuid: fixture.preview_activity_uuid, document } })
  expect(created.ok(), await created.text()).toBeTruthy()
  const preview = new URL((await created.json()).url)
  await page.goto(preview.pathname + preview.search)

  // The activity's dark default: light text, a starfield, a labelled exit, and the footer button beside Continue.
  const surface = page.locator('[data-learning-activity-surface]')
  await expect(surface.getByText('Welcome aboard')).toBeVisible()
  await expect(surface).toHaveClass(/learning-tone-dark/)
  await expect(surface.locator('[data-scene="starfield"]')).toHaveCount(1)
  await expect(surface.getByRole('button', { name: 'Save for later' })).toBeVisible()
  await expect(surface.getByRole('button', { name: 'Skip ahead' })).toHaveCount(1)
  await expect(surface.getByRole('button', { name: 'Back' })).toHaveCount(0)
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('activity-design-intro.png') })

  // The footer button completes the page; the next page's own light background replaces the default.
  await surface.getByRole('button', { name: 'Skip ahead' }).click()
  const calm = surface.getByRole('radio', { name: /Calm/ })
  await expect(calm).toBeVisible()
  await expect(surface).toHaveClass(/learning-tone-light/)
  await expect(surface.getByText('Slow and steady')).toBeVisible()
  // Cards take the light page's own surface, not the dark theme around the player.
  await expect(calm).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  // Back returns along the route, and Continue comes back.
  await surface.getByRole('button', { name: 'Back' }).click()
  await expect(surface.getByText('Welcome aboard')).toBeVisible()
  await surface.getByRole('button', { name: /^Continue/ }).click()
  await expect(calm).toBeVisible()
  await calm.click()
  await expect(calm).toHaveAttribute('aria-checked', 'true')
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('activity-design-cards.png') })
  await surface.getByRole('button', { name: /^Continue/ }).click()
  await expect(surface.getByText('All set')).toBeVisible()

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
