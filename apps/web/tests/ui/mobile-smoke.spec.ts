import { expect, test } from '@playwright/test'
import { assertActualApp } from './auth'
import { loadUiTestEnvironment } from './environment'

const environment = loadUiTestEnvironment({ requireCredentials: false })

test('mobile.hub-composer: authenticated Hub remains usable at phone width', async ({ page }) => {
  await page.goto(environment.hubPath)
  await assertActualApp(page)
  await expect(page.getByLabel('Ask a question or search Launch LMS')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
})
