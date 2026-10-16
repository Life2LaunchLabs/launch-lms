import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'
import { launchGoal, nameGoal } from './goalLaunch'

const environment = loadUiTestEnvironment({ requireCredentials: false })

async function askHub(page: import('@playwright/test').Page, prompt: string) {
  const composer = page.getByLabel('Ask a question or search Launch LMS')
  await expect(composer).toBeVisible()
  await composer.fill(prompt)
  await page.getByRole('button', { name: 'Send message' }).click()
}

test('hub.action.create-plan: Coach points to a new goal but never sets it up', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await askHub(page, 'I want to create a plan for changing careers')

  // Starting a goal is the learner's own decision: the button only opens the launch flow.
  await expect(page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Work on this plan' })).toHaveCount(0)
  const action = page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Start a goal', exact: true })
  await expect(action).toBeVisible()
  await action.focus()
  await expect(action).toBeFocused()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-create-plan-action.png'), fullPage: true })
  }
  await action.press('Enter')
  await expect(page.getByText('What do you want to work toward?')).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/launch') && !url.searchParams.has('hub_action'))
  await expect(page.getByRole('textbox', { name: 'Your goal' })).toHaveValue('')
  await expect(page.getByText('Suggested by Coach')).toHaveCount(0)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})

test('plans.coach-session: Coach suggests on the goal itself', async ({ page }, testInfo) => {
  await page.goto(environment.plansPath)
  await assertActualApp(page)
  await launchGoal(page, `Planning practice ${Date.now().toString(36).slice(-6)}`)

  await page.getByRole('button', { name: 'Goal actions' }).click()
  await page.getByRole('menuitem', { name: 'Plan with Coach' }).click()
  await expect(page.getByText('Coach is working with you')).toBeVisible()
  await expect(page.locator('section.hub-panel')).toContainText('Planning:')

  // Coach's stages arrive as quiet suggested lines on the goal, not in a separate form.
  const explore = page.getByRole('group', { name: 'Suggested stage Explore' })
  await expect(explore).toBeVisible()
  await expect(page.getByRole('group', { name: /^Suggested stage / })).toHaveCount(3)
  // On a phone Coach covers the goal; tuck it to work on the page.
  if (testInfo.project.name.includes('phone')) await page.getByRole('button', { name: 'Show the page', exact: true }).click()
  await explore.getByRole('button', { name: 'Add Explore' }).click()
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: /^Suggested stage / })).toHaveCount(2)
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('plans-coach-session.png'), fullPage: true })
  }

  // Ending the session leaves the unreviewed suggestions on the goal.
  await page.getByRole('button', { name: 'End Coach’s session' }).click()
  await expect(page.getByText('Coach is working with you')).toHaveCount(0)
  await expect(page.getByRole('group', { name: /^Suggested stage / })).toHaveCount(2)
})

test('hub.action.timeline: advice can hand off to the Timeline editor', async ({ page }, testInfo) => {
  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await askHub(page, 'Please help me add my new job to my portfolio timeline')

  const action = page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Add to Timeline' })
  await expect(action).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-add-timeline-action.png'), fullPage: true })
  }
  await action.click()
  await expect(page.getByRole('dialog', { name: 'Add experience' })).toBeVisible()
  await expect(page.getByLabel('Type')).toHaveValue('work_career')
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/portfolio/timeline') && !url.searchParams.has('experience'))
  await expect(page.locator('section.hub-panel')).toContainText('Please help me add my new job to my portfolio timeline')
})

test('hub.action.unavailable: a rejected action stays in context and explains the failure', async ({ page }) => {
  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await askHub(page, 'I want to create a plan for improving my interview skills')
  const action = page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Start a goal', exact: true })
  await expect(action).toBeVisible()

  await page.route('**/api/v1/hub/actions/*/resolve?*', async (route) => {
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'That destination is no longer available' }) })
  })
  await action.click()
  await expect(page.getByRole('alert').filter({ hasText: 'That destination is no longer available' })).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/plans'))
})

test('plans.launch: a new goal starts in the launch flow and lands with its answers', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.plansPath)
  await assertActualApp(page)
  const started = page.waitForResponse((response) => /\/goals\/launch$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: /create your own/i }).filter({ visible: true }).first().click()
  const goalUuid = (await (await started).json()).goal.goal_uuid
  const title = `Pick a college ${goalUuid.slice(-6)}`
  const next = () => page.getByRole('button', { name: /^(Continue|Finish)/ }).click()

  await nameGoal(page, title)
  await page.getByRole('textbox', { name: 'Why it matters' }).fill('I want a place that fits me.')
  await next()
  await page.getByRole('radio', { name: /A few months/ }).click()
  await next()
  await page.getByRole('radio', { name: /Just an idea/ }).click()
  await next()
  await page.getByRole('radio', { name: /I.ll steer/ }).click()
  await next()
  // The plans to start from come from the organization; nothing has to be picked.
  await expect(page.getByText('Start from a plan?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start blank' })).toBeVisible()
  await expect(page.getByText(/No plans to start from yet|stages?/).first()).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') await page.waitForTimeout(1000)
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('plans-launch-templates.png'), fullPage: true })
  await page.getByRole('button', { name: 'Start blank' }).click()
  await expect(page.getByText('Your goal is ready.', { exact: false })).toBeVisible()
  await next()

  // Finishing opens the goal with what the learner said, each part editable from its own menu.
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}`))
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Goal settings' })).toBeVisible()
  await expect(page.getByText('I want a place that fits me.').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Coach checks in monthly/ })).toBeVisible()

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})

test('plans.launch-draft: a goal left mid-setup says so and reopens the launch flow', async ({ page }) => {
  await page.goto(environment.plansPath)
  await assertActualApp(page)
  const started = page.waitForResponse((response) => /\/goals\/launch$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: /create your own/i }).filter({ visible: true }).first().click()
  const goalUuid = (await (await started).json()).goal.goal_uuid
  const title = `Half set up ${goalUuid.slice(-6)}`
  await nameGoal(page, title)
  await expect(page.getByRole('textbox', { name: 'Why it matters' })).toBeVisible()

  await page.goto(environment.plansPath)
  const tab = page.getByRole('button', { name: `${title}, finish setting up` })
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}/launch`))
  await expect(page.getByRole('textbox', { name: 'Why it matters' })).toBeVisible()
})
