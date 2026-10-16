import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

test('hub.questions: Coach asks structured questions and the answers come back as the learner’s message', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  const composer = page.getByLabel('Ask a question or search Launch LMS')
  await composer.fill('Ask me a few questions so you can help me plan')
  await page.getByRole('button', { name: 'Send message' }).click()

  const questions = page.getByRole('form', { name: 'Coach’s questions' })
  await expect(questions).toBeVisible()
  const send = questions.getByRole('button', { name: 'Send answers' })
  await expect(send).toBeDisabled()
  await questions.getByRole('radio', { name: 'A few hours' }).click()
  await expect(questions.getByRole('radio', { name: 'A few hours' })).toHaveAttribute('aria-checked', 'true')
  await questions.getByRole('radio', { name: '4 of 5' }).click()
  // The text question can be skipped; every other one needs an answer before sending.
  await questions.getByRole('button', { name: 'Skip: Anything that might get in the way?' }).click()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-questions.png'), fullPage: true })
  }
  await send.click()

  const panel = page.locator('section.hub-panel')
  await expect(panel).toContainText('How much time can you give this each week? A few hours')
  await expect(panel).toContainText('Anything that might get in the way? skipped')
  await expect(panel).toContainText('Thanks, that helps.')
  await expect(questions).toHaveCount(0)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
