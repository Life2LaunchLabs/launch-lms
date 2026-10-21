import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'
import { launchGoal } from './goalLaunch'

const environment = loadUiTestEnvironment({ requireCredentials: false })

test('goal.coach-notes: a check-in leaves a note on the goal that runs from the Coach chat', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto(environment.plansPath)
  await assertActualApp(page)
  const title = `Check-in practice ${Date.now().toString(36).slice(-6)}`
  const { goalUuid, authorization, api } = await launchGoal(page, title)

  // Coach's check-in runs on a schedule; the dev route runs it now, as if the goal's first hour had passed.
  const checkIn = await page.request.post(`${api}dev/goals/${goalUuid}/check-in`, { headers: { authorization } })
  expect(checkIn.ok()).toBeTruthy()

  // The goal's tab gets a dot; the goal's Coach bar says what Coach noticed.
  await page.goto(environment.plansPath)
  const tab = page.getByRole('button', { name: `${title}, 0% complete, Coach has a note` })
  await expect(tab).toBeVisible()
  await tab.click()
  const bar = page.getByRole('button', { name: 'Coach has a note: Ready for a first step?' })
  await expect(bar).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('goal-coach-bar.png'), fullPage: true })
  }

  // Opening it shows the note as a card in the chat, and its action starts Coach's session on the goal.
  await bar.click()
  const note = page.locator('section.hub-panel').getByRole('article', { name: 'Coach’s note: Ready for a first step?' })
  await expect(note).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('goal-coach-note-card.png'), fullPage: true })
  }
  await note.getByRole('button', { name: 'Plan it with me' }).click()
  await expect(page.getByText('Coach is working with you')).toBeVisible()
  await expect(note).toHaveCount(0)
  if (testInfo.project.name.includes('phone')) await page.getByRole('button', { name: 'Show the page', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Coach checks in weekly/ })).toBeVisible()

  expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([])
})
