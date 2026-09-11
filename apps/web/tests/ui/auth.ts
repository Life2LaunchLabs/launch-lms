import { expect, type Page } from '@playwright/test'
import type { UiTestEnvironment } from './environment'

export async function loginNormally(page: Page, environment: UiTestEnvironment): Promise<void> {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /welcome back|sign in/i })).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Email address').fill(environment.email)
  await page.getByLabel('Password').fill(environment.password)
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click()
  await page.waitForURL((url) => !['/login', '/auth/login'].includes(url.pathname), { timeout: 20_000 })
  await expect(page.getByLabel('Email address')).toHaveCount(0)
}

export async function assertActualApp(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/(?:auth\/)?login/)
  await expect(page.getByText(/application error|internal server error/i)).toHaveCount(0)
}
