import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

async function askHub(page: import('@playwright/test').Page, prompt: string) {
  const composer = page.getByLabel('Ask a question or search Launch LMS')
  await expect(composer).toBeVisible()
  await composer.fill(prompt)
  await page.getByRole('button', { name: 'Send message' }).click()
}

test('hub.action.create-plan: learner controls suggested navigation', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await askHub(page, 'I want to create a plan for changing careers')

  const action = page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Work on this plan', exact: true })
  await expect(action).toBeVisible()
  await expect(action).toBeEnabled()
  await action.focus()
  await expect(action).toBeFocused()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-create-plan-action.png'), fullPage: true })
  }
  await action.press('Enter')
  await expect(page.getByRole('heading', { name: 'What are you working toward?' })).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/plans') && !url.searchParams.has('hub_action'))
  await expect(page.locator('section.hub-panel')).toContainText('I want to create a plan for changing careers')
  await expect(page.locator('section.hub-panel')).toContainText('Creating a goal:')

  await expect(page.getByText('Ready to review', { exact: true })).toBeVisible()
  // The Coach transcript's "Create a goal" session label also matches a loose 'Goal' label.
  await expect(page.getByRole('textbox', { name: /^Goal/ })).toHaveValue('Career transition plan')
  await expect(page.getByText('Suggested by Coach')).toHaveCount(3)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
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
  const action = page.getByTestId('hub-suggested-actions').last().getByRole('button', { name: 'Work on this plan', exact: true })
  await expect(action).toBeVisible()

  await page.route('**/api/v1/hub/actions/*/resolve?*', async (route) => {
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'That destination is no longer available' }) })
  })
  await action.click()
  await expect(page.getByRole('alert').filter({ hasText: 'That destination is no longer available' })).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/plans'))
})

test('plans.create-editor: a new goal opens for editing in place', async ({ page }, testInfo) => {
  await page.goto(environment.plansPath)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible()
  const create = page.getByRole('button', { name: /create your own/i }).filter({ visible: true }).first()
  await create.click()
  // Creating makes a "New goal" and opens it in place with editing on, ready to name it.
  const title = page.getByRole('textbox', { name: 'Goal title' })
  await expect(title).toHaveValue('New goal')
  const editSwitch = page.getByRole('switch', { name: 'Edit' })
  await expect(editSwitch).toHaveAttribute('aria-checked', 'true')
  await expect(page).toHaveURL((url) => Boolean(url.searchParams.get('edit')))
  // Fields save as they are left: rename the goal and add a step from the add line.
  await title.fill('Pick a college')
  await title.press('Enter')
  const newStep = page.getByRole('textbox', { name: 'New step' }).first()
  await newStep.fill('Decide on a shortlist')
  await newStep.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Step title' })).toHaveValue('Decide on a shortlist')
  // Turning editing off shows the same goal as the learner works it.
  await editSwitch.click()
  await expect(editSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('heading', { name: 'Pick a college', level: 1 })).toBeVisible()
  await expect(page.getByText('Decide on a shortlist').first()).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('plans-create-editor.png'), fullPage: true })
  }
})
