import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })
const coachPath = environment.plansPath.replace(/plans(\?.*)?$/, 'admin/platform/coach')

test('coach.sharing: a learner shares a Coach conversation and the coaching team turns it into a test', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const capture = async (name: string) => {
    if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
  }

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  const opening = `thinking about quitting culinary school ${Date.now().toString(36)}`
  await page.getByLabel('Ask a question or search Launch LMS').fill(opening)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Thinking…')).toHaveCount(0, { timeout: 30_000 })

  // The learner chooses to share, from the conversation menu, and sees what the team will get.
  await page.getByRole('button', { name: 'Conversation options' }).click()
  await page.getByRole('menuitem', { name: 'Share with coaching team' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share with the coaching team' })
  await expect(dialog).toContainText('without your name')
  await dialog.getByRole('textbox').fill('Coach helped me slow down')
  await dialog.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(dialog).toContainText('You shared this conversation')
  await capture('coach-share-dialog')
  await page.keyboard.press('Escape')

  // The coaching team sees it without a name, and starts a conversation test from it.
  await page.goto(`${coachPath}/tests`)
  const shared = page.getByRole('listitem').filter({ hasText: '“Coach helped me slow down”' }).first()
  await expect(shared).toBeVisible()
  await shared.getByRole('button', { name: 'Make a test' }).click()
  await expect(page.getByRole('textbox', { name: 'What the learner says' })).toHaveValue(opening)
  await expect(page.getByRole('radio', { name: 'They talk with Coach for a few turns' })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'How they act' })).toHaveValue(/Acts like the learner in a shared conversation/)
  await capture('coach-shared-to-test')
  await page.getByRole('button', { name: 'Cancel' }).click()

  // Leave the shared test platform as it was.
  page.once('dialog', (confirm) => void confirm.accept())
  await shared.getByRole('button', { name: 'Remove shared conversation' }).click()
  await expect(shared).toHaveCount(0)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
