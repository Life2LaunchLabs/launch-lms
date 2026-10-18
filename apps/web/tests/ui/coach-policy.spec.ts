import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })
// Platform pages sit beside Plans: /orgs/<slug>/admin/platform/coach, or /admin/platform/coach on an org host.
const coachPath = environment.plansPath.replace(/plans(\?.*)?$/, 'admin/platform/coach')

test('platform.coach-policy: the coaching team edits the method, knowledge, routines and abilities, tests the draft and releases it', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  const capture = async (name: string) => {
    if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
  }

  await page.goto(coachPath)
  await assertActualApp(page)
  // Tabs are links; the steps below go to them by URL because save toasts can sit over the tab row for a moment.
  await expect(page.getByRole('navigation', { name: 'Coach policy' }).getByRole('link')).toHaveCount(7)

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

  // Releases: the method edit waits in the draft until it is released; rolling back makes the earlier release live again.
  await expect(page.getByRole('status').filter({ hasText: '1 change in the draft' })).toBeVisible()
  await page.goto(`${coachPath}/releases`)
  await expect(page.getByText('Edited the method', { exact: true }).first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Release note' }).fill('Notice effort first')
  await page.getByRole('button', { name: 'Release to learners' }).click()
  await expect(page.getByText(/^Release \d+ is live\.$/)).toBeVisible()
  await expect(page.getByText(/The draft is the same as release \d+\./)).toBeVisible()
  await capture('coach-releases')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Roll back to this' }).first().click()
  await expect(page.getByText(/^Release \d+ is live again\.$/)).toBeVisible()
  await expect(page.getByText(/^Rolled back to release \d+$/).first()).toBeVisible()

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

  // Tests: a realistic learner and a rubric; a run grades the draft and shows each response with the judge's evidence.
  await page.goto(`${coachPath}/tests`)
  const testTitle = `Rough shift ${Date.now().toString(36)}`
  await page.getByRole('button', { name: 'New test' }).click()
  await page.getByPlaceholder('Wants to quit after a bad shift').fill(testTitle)
  await page.getByRole('textbox', { name: 'Headline' }).fill('Line cook, saving for culinary school')
  await page.getByRole('textbox', { name: 'What the learner says' }).fill('honestly idk if school is even worth it, tonight was rough')
  await page.getByRole('radio', { name: 'They talk with Coach for a few turns' }).check()
  await page.getByRole('textbox', { name: 'How they act' }).fill('Short, tired answers until Coach asks about the shift itself.')
  await page.getByRole('textbox', { name: 'Line 2', exact: true }).fill('Asks at most one question')
  await page.getByRole('button', { name: 'Save test' }).click()
  const scenario = page.getByRole('button', { name: new RegExp(`^${testTitle}`) })
  await expect(scenario).toBeVisible()
  await page.getByRole('button', { name: 'Run tests on the draft' }).click()
  await expect(page.getByRole('list', { name: 'Results by test' }).getByText(testTitle, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^Musts \d+\/\d+$/).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: /Asks at most one question/ }).first()).toBeVisible()
  await page.getByText('Responses and evidence').first().click()
  await expect(page.getByText(/Learner: ok but i dont really know where to start/).first()).toBeVisible()
  await capture('coach-tests')
  await scenario.click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(scenario).toHaveCount(0)

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
