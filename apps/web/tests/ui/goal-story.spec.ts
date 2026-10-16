import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'
import { launchGoal } from './goalLaunch'

const environment = loadUiTestEnvironment({ requireCredentials: false })

test('goal.story: finishing a goal opens its story, which ends on the medal and returns to the goal', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.plansPath)
  await assertActualApp(page)
  const title = `Story practice ${Date.now().toString(36).slice(-6)}`
  const { goalUuid } = await launchGoal(page, title)

  await page.getByRole('button', { name: 'Goal actions' }).click()
  await page.getByRole('menuitem', { name: 'Finish goal' }).click()

  // The goal greets the learner with its story, once.
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}/story`))
  const surface = page.locator('[data-learning-activity-surface]')
  await expect(surface.getByText('Your story')).toBeVisible()
  await expect(surface.getByRole('heading', { name: title })).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') { await page.waitForTimeout(1200); await page.screenshot({ path: testInfo.outputPath('goal-story-open.png') }) }
  // A goal finished with nothing ticked off skips the numbers and goes to the medal.
  await surface.getByRole('button', { name: /^Continue/ }).click()
  await expect(surface.getByText('Goal complete')).toBeVisible()
  await expect(surface.getByText(title)).toBeVisible()
  await expect(surface.getByText('You set out to do this, and you saw it through.')).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') { await page.waitForTimeout(1200); await page.screenshot({ path: testInfo.outputPath('goal-story-medal.png') }) }
  await surface.getByRole('button', { name: /^Done/ }).click()

  // Done returns to the finished goal, which keeps its story under the goal's actions.
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}`))
  await page.getByRole('button', { name: 'Goal actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Watch your story' })).toBeVisible()

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})

test('activity.story-blocks: stat, chart, quote and medal blocks play in any activity', async ({ page }, testInfo) => {
  const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
  const blocks = [
    { id: 'blk_stats', type: 'stat', content: { items: [{ value: 12, label: 'steps done' }, { value: 6, label: 'weeks' }, { value: 2, label: 'decisions made' }] } },
    { id: 'blk_chart', type: 'chart', content: { kind: 'bars', title: 'Steps done each week', values: [1, 3, 0, 2, 4, 2], labels: ['Sep 1', '', '', '', '', 'Oct 6'] } },
    { id: 'blk_quote', type: 'quote', content: { text: 'I wanted to feel strong again. I do.', attribution: 'Why you started' } },
    { id: 'blk_medal', type: 'medal', content: { title: 'Run a 10k', subtitle: 'Goal complete' } },
  ]
  const document = {
    format: 'launch-lms.activity', format_version: 1,
    activity: { title: 'Story blocks', settings: { design: { background: { color: '#0b1026', gradient_to: '#3b0764', scene: 'starfield' } } } },
    pages: [{ page_uuid: 'story', title: 'Story', content: { version: 2, blocks } }],
  }
  const signedIn = page.waitForResponse((response) => response.url().includes('/api/v1/') && Boolean(response.request().headers().authorization))
  await page.goto(environment.plansPath)
  await assertActualApp(page)
  const response = await signedIn
  const api = response.url().split('/api/v1/')[0] + '/api/v1/'
  const created = await page.request.post(`${api}learning-previews/`, { headers: { authorization: response.request().headers().authorization }, data: { activity_uuid: fixture.preview_activity_uuid, document } })
  expect(created.ok(), await created.text()).toBeTruthy()
  const preview = new URL((await created.json()).url)
  await page.goto(preview.pathname + preview.search)

  const surface = page.locator('[data-learning-activity-surface]')
  // Numbers count up to their values; screen readers get the value straight away.
  await expect(surface.locator('dd').first()).toContainText('12')
  await expect(surface.getByRole('img', { name: /Steps done each week\. Sep 1: 1/ })).toBeVisible()
  await expect(surface.getByText('Why you started')).toBeVisible()
  await expect(surface.getByText('Goal complete')).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') { await page.waitForTimeout(2500); await page.screenshot({ path: testInfo.outputPath('story-blocks.png'), fullPage: true }) }
})
