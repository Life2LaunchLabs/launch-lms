import { expect, test, type Page, type Route } from '@playwright/test'

const feedback = {
  key: 'BOT-301',
  message: 'The save button disappears after I add a second item.',
  status: 'in_progress',
  priority: 'high',
  fixed_in_revision: null,
  submitter: 'Preview tester',
  created_at: '2026-09-10T17:00:00Z',
  updated_at: '2026-09-10T18:00:00Z',
  entries: [
    { id: '1', message: 'Thanks — we are working on this.', internal: false, author: 'Henry', created_at: '2026-09-10T17:30:00Z' },
    { id: '2', message: 'Likely the narrow layout breakpoint.', internal: true, author: 'Henry', created_at: '2026-09-10T17:31:00Z' },
  ],
  attachments: [{ id: '77', filename: 'save-button.png', content_type: 'image/png', size: 2048 }],
}

const releaseFeed = {
  current_revision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  repository: 'Life2LaunchLabs/launch-lms',
  has_unread: true,
  unseen: [{
    revision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    published_at: '2026-09-10T18:00:00Z',
    title: 'Push bbbbbbb',
    notes: [{ text: 'You can now duplicate a plan without rebuilding its objectives.', url: 'https://github.com/Life2LaunchLabs/launch-lms/pull/123' }],
  }],
  previous: [{
    revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    published_at: '2026-09-09T18:00:00Z',
    title: 'Push aaaaaaa',
    notes: [{ text: 'Solved a problem that hid learner progress on phones.' }],
  }],
}

async function mockCandidateApi(page: Page) {
  await page.route('**/api/v1/candidate/**', async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/configuration')) return route.fulfill({ json: { feedback_configured: true, revision: releaseFeed.current_revision, unstable: true, release_channel: 'unstable' } })
    if (path.endsWith('/releases/viewed')) return route.fulfill({ json: { revision: releaseFeed.current_revision } })
    if (path.endsWith('/releases')) return route.fulfill({ json: releaseFeed })
    if (path.endsWith('/feedback') && request.method() === 'GET') {
      const isAdmin = new URL(request.url()).searchParams.get('admin') === 'true'
      return route.fulfill({ json: [{ ...feedback, entries: isAdmin ? feedback.entries : feedback.entries.filter((entry) => !entry.internal) }] })
    }
    if (path.endsWith('/feedback') && request.method() === 'POST') return route.fulfill({ status: 201, json: feedback })
    if (path.includes('/attachments/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) })
    if (path.endsWith('/admin')) {
      const update = request.postDataJSON()
      return route.fulfill({ json: { ...feedback, ...update, fixed_in_revision: update.status === 'awaiting_confirmation' ? releaseFeed.current_revision : null } })
    }
    if (path.endsWith('/reply')) return route.fulfill({ json: feedback })
    if (path.endsWith('/confirm')) return route.fulfill({ json: { ...feedback, status: request.postDataJSON().solved ? 'solved' : 'open' } })
    return route.fulfill({ json: feedback })
  })
}

test.beforeEach(async ({ page }) => mockCandidateApi(page))

test('tester sees unread GitHub notes and can paste a screenshot into quick feedback', async ({ page }, testInfo) => {
  await page.goto('/hub')
  await expect(page.getByText('Unstable', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /what's new/i }).click()
  await expect(page.getByText('New since you last tested')).toBeVisible()
  await expect(page.getByText('You can now duplicate a plan without rebuilding its objectives.')).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-whats-new.png'), fullPage: true })

  await page.getByRole('tab', { name: 'Feedback' }).click()
  const textarea = page.getByLabel('Feedback message')
  await textarea.fill('The plan editor jumped while I was typing.')
  await textarea.evaluate((element) => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'pasted-screen.png', { type: 'image/png' }))
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  })
  await expect(page.getByAltText('pasted-screen.png')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'uploaded-screen.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await textarea.evaluate((element) => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'dropped-screen.png', { type: 'image/png' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  })
  await expect(page.getByAltText('uploaded-screen.png')).toBeVisible()
  await expect(page.getByAltText('dropped-screen.png')).toBeVisible()
  await expect(page.getByText('3/3')).toBeVisible()
  await expect(page.getByText('Your submission history')).toBeVisible()
  await expect(page.getByText('Likely the narrow layout breakpoint.')).toHaveCount(0)
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-feedback.png'), fullPage: true })
})

test('admin can triage Jira-backed feedback and prepare tester confirmation', async ({ page }, testInfo) => {
  await page.goto('/admin/feedback')
  await expect(page.getByRole('heading', { name: feedback.message })).toBeVisible()
  await expect(page.getByText('Internal note · Henry')).toBeVisible()
  await page.getByPlaceholder('This push should have solved…').fill('The save button now stays visible while you add items.')
  await page.getByRole('button', { name: 'Send for tester confirmation' }).click()
  await expect(page.getByText('Waiting for tester')).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-admin-triage.png'), fullPage: true })
})
