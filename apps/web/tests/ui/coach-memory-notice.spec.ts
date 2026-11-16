import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

// FEED-239: on a phone the memory notice was docked over the conversation with the composer, so it
// covered Coach's answer until the learner closed it. It now scrolls with the conversation.
test('hub.memory-notice: the memory notice never covers Coach’s answer', async ({ page }, testInfo) => {
  // A short phone screen (Safari with its toolbars) is where the docked notice hid the whole answer.
  if (testInfo.project.name.includes('phone')) await page.setViewportSize({ width: 390, height: 664 })
  // The notice shows once per learner; show it whatever earlier scenarios answered.
  await page.route(/\/api\/v1\/hub\/memory\?org_id=/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ response, json: { ...body, notice_dismissed: false } })
  })

  await page.goto(environment.hubPath)
  await assertActualApp(page)
  const notice = page.getByRole('complementary', { name: 'Coach memory notice' })
  await expect(notice).toBeVisible()

  await page.getByLabel('Ask a question or search Life2Launch').fill('What should I work on next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  const answer = page.getByText('A plan can turn that direction into goals and next steps.')
  await expect(answer).toBeVisible()
  await expect(notice).toBeVisible()

  // Every line of the answer, first to last, is what the screen shows there: nothing sits over it.
  await answer.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect.poll(() => answer.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return [box.top + 4, box.top + box.height / 2, box.bottom - 4].every((y) => {
      const hit = document.elementFromPoint(box.left + 8, y)
      return Boolean(hit && (element === hit || element.contains(hit)))
    })
  })).toBe(true)

  if (process.env.UI_TEST_CAPTURE === 'true') {
    await page.screenshot({ path: testInfo.outputPath('hub-memory-notice.png') })
  }

  await notice.getByRole('button', { name: 'Dismiss memory notice' }).click()
  await expect(notice).toHaveCount(0)
})
