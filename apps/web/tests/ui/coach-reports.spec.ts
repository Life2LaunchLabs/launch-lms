import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })
const coachPath = environment.plansPath.replace(/plans(\?.*)?$/, 'admin/platform/coach')

test('coach.reports: a learner reports a Coach reply and the coaching team turns it into a test', async ({ page }, testInfo) => {
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

  // The learner reports Coach's reply and sees what the team will get.
  const note = `told me to just quit ${Date.now().toString(36)}`
  await page.getByRole('button', { name: 'Report this reply' }).last().click()
  const dialog = page.getByRole('dialog', { name: 'Report this reply' })
  await expect(dialog).toContainText('without your name')
  await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled()
  await dialog.getByRole('radio', { name: 'Not helpful' }).check()
  await dialog.getByRole('textbox').fill(note)
  await capture('coach-report-dialog')
  await dialog.getByRole('button', { name: 'Send report' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('The coaching team will look at it.')).toBeVisible()

  // The coaching team sees the conversation up to the reply, and starts a test from it.
  await page.goto(`${coachPath}/tests`)
  const report = page.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: note }).first()
  await expect(report).toContainText('Not helpful')
  await expect(report).toContainText('New')
  await expect(report).toContainText(opening)
  await expect(report).toContainText('Reported reply')
  if (process.env.UI_TEST_CAPTURE === 'true') await report.screenshot({ path: testInfo.outputPath('coach-reports-queue.png') })
  await report.getByRole('button', { name: 'Make a test' }).click()
  await expect(page.getByRole('textbox', { name: 'What the learner says' })).toHaveValue(opening)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await report.getByRole('button', { name: 'Mark reviewed' }).click()
  await expect(report).toContainText('Reviewed')
  await expect(report.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
