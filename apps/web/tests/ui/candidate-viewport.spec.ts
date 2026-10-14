import { expect, test } from '@playwright/test'

const longText = 'ViewportRegression'.repeat(18)

test('BOT-217 populated Coach and candidate viewport', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.route('**/api/v1/candidate/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/configuration')) return route.fulfill({ json: { unstable: true, feedback_configured: true } })
    if (path.endsWith('/announcements')) return route.fulfill({ json: { unread: [], items: [{ id: 'viewport', title: longText, message: longText.repeat(8), published_at: '2026-09-10T17:00:00Z' }] } })
    return route.fulfill({ json: [] })
  })
  await page.route('**/api/v1/hub/conversations?*', route => route.fulfill({ json: Array.from({ length: 12 }, (_, i) => ({ conversation_uuid: `viewport-${i}`, title: `Synthetic recent conversation ${i + 1}: ${longText}`, updated_at: '2026-09-10T17:00:00Z', resource_count: i })) }))
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme)
    for (const viewport of [{ width: 1280, height: 551 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/plans?coach=open')
      await expect(page.getByText('Unstable', { exact: true })).toBeVisible()
      await expect(page.getByText(/Synthetic recent conversation 1:/)).toBeVisible()
      const prefix = `${theme}-${viewport.width}x${viewport.height}`
      const capture = async (state: string) => {
        const bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, scrollX, scrollY, hub: document.querySelector('.hub-panel')?.getBoundingClientRect().toJSON(), panel: document.querySelector('[aria-modal="true"]')?.getBoundingClientRect().toJSON(), panelWidth: document.querySelector('[aria-modal="true"]')?.scrollWidth }))
        console.log(prefix, state, JSON.stringify(bounds))
        const screenshot = await page.screenshot({ path: testInfo.outputPath(`bot217-${prefix}-${state}.png`), fullPage: true })
        // Only this synthetic fixture opts into portable review evidence.
        await testInfo.attach(`synthetic-review:bot217-${prefix}-${state}.png`, { body: screenshot, contentType: 'image/png' })
        expect.soft(bounds.documentWidth, `${prefix} ${state} horizontal document bounds`).toBeLessThanOrEqual(viewport.width)
        expect.soft(bounds.documentHeight, `${prefix} ${state} vertical document bounds`).toBeLessThanOrEqual(viewport.height)
        if (bounds.panel) {
          expect.soft(bounds.panel.bottom).toBeLessThanOrEqual(viewport.height)
          expect.soft(bounds.panelWidth).toBeLessThanOrEqual(bounds.panel.width)
        }
      }
      await capture('closed')
      // Feedback opens from the navigation (desktop sidebar); the tester bar only carries announcements.
      const panels = viewport.width >= 768 ? [['Announcements', 'announcements panel'], ['Send feedback', 'Feedback']] : [['Announcements', 'announcements panel']]
      for (const [name, dialogName] of panels) {
        const trigger = page.getByRole('button', { name, exact: true })
        await trigger.click()
        await expect(page.getByRole('dialog', { name: dialogName })).toBeVisible()
        if (name === 'Announcements') await expect(page.getByRole('dialog').getByText(longText, { exact: true }).first()).toBeVisible()
        await capture(name === 'Announcements' ? 'announcements' : 'feedback')
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
      }
    }
  }
})
