import { expect, type Page } from '@playwright/test'

/** Names the goal on the launch flow's first page and moves on (retrying while the page hydrates). */
export async function nameGoal(page: Page, title: string) {
  const field = page.getByRole('textbox', { name: 'Your goal' })
  const next = page.getByRole('button', { name: /^Continue/ })
  await expect(async () => {
    await field.fill(title)
    await expect(next).toBeEnabled({ timeout: 1000 })
  }).toPass()
  await next.click()
}

/** Starts a goal from "Create your own", names it, skips the rest of the launch flow and lands on the goal. */
export async function launchGoal(page: Page, title: string) {
  const started = page.waitForResponse((response) => /\/goals\/launch$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: /create your own/i }).filter({ visible: true }).first().click()
  const response = await started
  const launch = await response.json()
  const goalUuid: string = launch.goal.goal_uuid
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}/launch`))
  await nameGoal(page, title)
  await expect(page.getByRole('textbox', { name: 'Why it matters' })).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Skip to my goal' }).click()
  await expect(page.getByText('You’re set.').or(page.getByText("You're set."))).toBeVisible()
  await page.getByRole('button', { name: /^Finish/ }).click()
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalUuid}`))
  await expect(page.getByRole('button', { name: 'Goal settings' })).toBeVisible()
  return {
    goalUuid,
    authorization: (await response.request().allHeaders()).authorization,
    api: response.url().replace(/goals\/launch$/, ''),
  }
}
