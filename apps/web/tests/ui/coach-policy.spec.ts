import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })
// Platform pages sit beside Plans: /orgs/<slug>/admin/platform/coach, or /admin/platform/coach on an org host.
const coachPath = environment.plansPath.replace(/plans(\?.*)?$/, 'admin/platform/coach')

test('platform.coach-policy: the coaching team edits the method, knowledge, routines and abilities', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const capture = async (name: string) => {
    if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
  }

  await page.goto(coachPath)
  await assertActualApp(page)
  const tabs = page.getByRole('navigation', { name: 'Coach policy' })

  // Method: one markdown document, with a preview.
  const method = page.getByLabel('Method document')
  await expect(method).toHaveValue(/# How Coach coaches/)
  const marker = `Notice effort before results ${Date.now().toString(36)}.`
  await method.fill(`${await method.inputValue()}\n\n## Effort\n\n${marker}`)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { name: 'Effort' })).toBeVisible()
  await capture('coach-method')
  await page.getByRole('button', { name: 'Save method' }).click()
  await expect(page.getByText('Method saved.')).toBeVisible()

  // Knowledge: Safety is an always-on playbook; a new one is matched by "used when".
  await tabs.getByRole('link', { name: 'Knowledge' }).click()
  await expect(page.getByRole('button', { name: /Safety\s*Always/ })).toBeVisible()
  const title = `Big dreams ${Date.now().toString(36)}`
  await page.getByRole('button', { name: 'New playbook' }).click()
  await page.getByPlaceholder('Big career dreams').fill(title)
  await page.getByPlaceholder(/long-shot career/).fill('A learner wants a long-shot career like pro gaming')
  await page.getByLabel('Playbook', { exact: true }).fill('Take the dream seriously, then find the first real step.')
  await page.getByRole('button', { name: 'Save playbook' }).click()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
  await capture('coach-knowledge')

  // Routines: grouped by the moment they run on; the seeded voice routines are there.
  await tabs.getByRole('link', { name: 'Routines' }).click()
  await expect(page.getByRole('heading', { name: 'When a goal\'s check-in is due' })).toBeVisible()
  await expect(page.getByText('Check-in notes', { exact: true })).toBeVisible()
  await capture('coach-routines')

  // Abilities: plain switches in three groups, with the fixed rules shown read-only.
  await tabs.getByRole('link', { name: 'Abilities' }).click()
  await expect(page.getByRole('heading', { name: 'What Coach reads' })).toBeVisible()
  const askQuestions = page.getByRole('switch', { name: 'Ask quick questions' })
  await expect(askQuestions).toBeChecked()
  await askQuestions.click()
  await expect(askQuestions).not.toBeChecked()
  await askQuestions.click()
  await expect(askQuestions).toBeChecked()
  await expect(page.getByText('Every reply', { exact: true })).toBeVisible()
  await capture('coach-abilities')

  // Model: keys and tiers; Coach can't be turned on before Standard has a key and a model.
  await tabs.getByRole('link', { name: 'Model' }).click()
  await expect(page.getByRole('heading', { name: 'Model tiers' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standard', exact: true })).toBeVisible()
  await capture('coach-model')

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
