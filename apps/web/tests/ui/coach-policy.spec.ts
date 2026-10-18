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
  // Tabs are links; the steps below go to them by URL because save toasts can sit over the tab row for a moment.
  await expect(page.getByRole('navigation', { name: 'Coach policy' }).getByRole('link')).toHaveCount(5)

  // Method: one markdown document, with a preview.
  const method = page.getByRole('textbox', { name: 'Method document' })
  await expect(method).toHaveValue(/# How Coach coaches/)
  const original = await method.inputValue()
  const heading = `Effort ${Date.now().toString(36)}`
  await method.fill(`${original}\n\n## ${heading}\n\nNotice effort before results.`)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  await capture('coach-method')
  await page.getByRole('button', { name: 'Save method' }).click()
  await expect(page.getByText('Method saved.')).toBeVisible()

  // Knowledge: Safety is an always-on playbook; a new one is matched by "used when".
  await page.goto(`${coachPath}/knowledge`)
  await expect(page.getByRole('button', { name: /Safety\s*Always/ })).toBeVisible()
  const title = `Big dreams ${Date.now().toString(36)}`
  await page.getByRole('button', { name: 'New playbook' }).click()
  await page.getByPlaceholder('Big career dreams').fill(title)
  await page.getByPlaceholder(/long-shot career/).fill('A learner wants a long-shot career like pro gaming')
  await page.getByRole('textbox', { name: 'Playbook', exact: true }).fill('Take the dream seriously, then find the first real step.')
  await page.getByRole('button', { name: 'Save playbook' }).click()
  const playbook = page.getByRole('button', { name: new RegExp(`^${title}`) })
  await expect(playbook).toBeVisible()
  await capture('coach-knowledge')
  // Leave the shared test platform as it was.
  await playbook.click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(playbook).toHaveCount(0)
  await page.goto(coachPath)
  await method.fill(original)
  await page.getByRole('button', { name: 'Save method' }).click()
  await expect(page.getByText('Method saved.').first()).toBeVisible()

  // Routines: grouped by the moment they run on; the seeded voice routines are there.
  await page.goto(`${coachPath}/routines`)
  await expect(page.getByRole('heading', { name: 'When the learner comes back and a check-in is due' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Check-in notes' })).toBeVisible()
  await capture('coach-routines')

  // Abilities: plain switches in three groups, with the fixed rules shown read-only.
  await page.goto(`${coachPath}/abilities`)
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
  await page.goto(`${coachPath}/model`)
  await expect(page.getByRole('heading', { name: 'Model tiers' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standard', exact: true })).toBeVisible()
  await capture('coach-model')

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
