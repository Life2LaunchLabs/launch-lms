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
  await expect(page.locator('[aria-label="Hub companion"]')).toContainText('I want to create a plan for changing careers')
  await expect(page.locator('[aria-label="Hub companion"]')).toContainText('Creating a plan:')

  await expect(page.getByText('Ready to review', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Goal')).toHaveValue('Career transition plan')
  await expect(page.getByText('Suggested by Hub')).toHaveCount(3)

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
  await expect(page.locator('[aria-label="Hub companion"]')).toContainText('Please help me add my new job to my portfolio timeline')
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
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/hub'))
})

test('plans.create-editor: plans surface uses native object editing', async ({ page }, testInfo) => {
  await page.goto(environment.plansPath)
  await assertActualApp(page)
  await expect(page.getByRole('heading', { name: 'Plans', exact: true, level: 1 })).toBeVisible()
  const create = page.getByRole('button', { name: /create a plan|new plan/i }).first()
  await create.click()
  await expect(page.getByRole('heading', { name: 'What are you working toward?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('plans-create-editor.png'), fullPage: true })
  }
})
