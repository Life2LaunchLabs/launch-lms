import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

async function send(page: import('@playwright/test').Page, prompt: string) {
  await page.getByLabel('Ask a question or search Launch LMS').fill(prompt)
  await page.getByRole('button', { name: 'Send message' }).click()
}

async function chooseMode(page: import('@playwright/test').Page, mode: 'Chat' | 'Search' | 'Work') {
  await page.locator('fieldset').filter({ hasText: 'ChatSearchWork' }).getByText(mode, { exact: true }).click()
}

test('hub modes select the next turn and persist as transcript receipts', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  const chat = page.getByRole('radio', { name: 'Chat' })
  const search = page.getByRole('radio', { name: 'Search' })
  await expect(chat).toBeChecked()

  await chat.focus()
  await chat.press('ArrowRight')
  await expect(search).toBeFocused()
  await expect(search).toBeChecked()
  await chooseMode(page, 'Chat')

  await page.getByRole('button', { name: 'Add resource context' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Library' })).toHaveCount(0)

  await send(page, 'How should I prepare for an interview?')
  await expect(page.getByText('A plan can turn that direction into goals and next steps. You can start one and keep shaping it as you learn.')).toBeVisible()
  await expect(page.getByTestId('hub-message-intent').filter({ hasText: 'Chat' })).toHaveCount(1)
  await expect(chat).toBeChecked()

  await chooseMode(page, 'Search')
  await send(page, 'Could a guide help me decide?')
  await expect(page.getByRole('region', { name: 'Resource results for Could a guide help me decide?' })).toBeVisible()
  await expect(page.getByTestId('hub-message-intent').filter({ hasText: 'Search' })).toHaveCount(1)
  await expect(chat).toBeChecked()

  await chooseMode(page, 'Work')
  await send(page, 'I want to create a plan for interview practice')
  await expect(page.getByRole('button', { name: 'Work on this plan', exact: true })).toBeVisible()
  await expect(page.getByTestId('hub-message-intent').filter({ hasText: 'Work' })).toHaveCount(1)
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/hub'))
  await expect(page.getByRole('heading', { name: 'What are you working toward?' })).toHaveCount(0)
  await expect(chat).toBeChecked()

  await page.reload()
  await expect(page.getByTestId('hub-message-intent')).toHaveText(['Chat', 'Search', 'Work'])
  await expect(page.getByRole('radio', { name: 'Chat' })).toBeChecked()
  await expect.poll(async () => {
    const action = await page.getByRole('button', { name: 'Work on this plan', exact: true }).last().boundingBox()
    const composer = await page.getByLabel('Ask a question or search Launch LMS').locator('xpath=ancestor::form').boundingBox()
    return Boolean(action && composer && action.y + action.height <= composer.y)
  }).toBe(true)
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-chat-search-work.png') })
  }
  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})

test('stopping a mode request restores the draft and chosen mode', async ({ page }) => {
  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await page.route('**/api/v1/hub/advisor?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    await route.abort()
  })
  await chooseMode(page, 'Work')
  await send(page, 'Help me work on a plan')
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop response' }).click()
  await expect(page.getByLabel('Ask a question or search Launch LMS')).toHaveValue('Help me work on a plan')
  await expect(page.getByRole('radio', { name: 'Work' })).toBeChecked()
})
