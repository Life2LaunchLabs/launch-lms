import { expect, test, type Page, type Route } from '@playwright/test'

const feedback = {
  key: 'BOT-301',
  message: 'The save button disappears after I add a second item.',
  status: 'In Progress',
  status_id: '3',
  status_category: 'indeterminate',
  done_at: null,
  priority: 'High',
  priority_id: '2',
  visible_revision: '3:1',
  has_unread: true,
  intent: 'broken',
  tester_confirmed: false,
  submitter: 'Preview tester',
  created_at: '2026-09-10T17:00:00Z',
  updated_at: '2026-09-10T18:00:00Z',
  entries: [
    { id: '1', message: 'Thanks — we are working on this.', internal: false, audience: 'shared', author: 'Henry', created_at: '2026-09-10T17:30:00Z' },
    { id: '2', message: 'Likely the narrow layout breakpoint.', internal: true, audience: 'internal', author: 'Henry', created_at: '2026-09-10T17:31:00Z' },
  ],
  attachments: [{ id: '77', filename: 'save-button.png', content_type: 'image/png', size: 2048 }],
  transitions: [{ id: '21', name: 'Move to review', to: { id: '4', name: 'In Review', category: 'indeterminate' } }],
}

const announcements = [{ id: 'notice-1', title: 'Test data refresh Friday', message: 'Anything entered after noon may be reset.', published_at: '2026-09-10T17:00:00Z' }]
const workflow = {
  columns: [
    { id: 'column-0', name: 'Open', status_ids: ['1'] },
    { id: 'column-1', name: 'In the works', status_ids: ['3', '4'] },
    { id: 'column-2', name: 'Done', status_ids: ['5'] },
  ],
  priorities: [{ id: '1', name: 'Highest' }, { id: '2', name: 'High' }, { id: '3', name: 'Medium' }],
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
    if (path.endsWith('/feedback/workflow')) return route.fulfill({ json: workflow })
    if (path.endsWith('/announcements/viewed')) return route.fulfill({ json: { seen: announcements.map((item) => item.id) } })
    if (path.endsWith('/announcements')) return route.fulfill({ status: request.method() === 'POST' ? 201 : 200, json: request.method() === 'POST' ? announcements[0] : { items: announcements, unread: announcements } })
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
      return route.fulfill({ json: { ...feedback, status_id: update.status_id || feedback.status_id, status: update.status_id === '4' ? 'In Review' : feedback.status, priority_id: update.priority_id || feedback.priority_id } })
    }
    if (path.endsWith('/reply')) return route.fulfill({ json: feedback })
    if (path.endsWith('/comment')) return route.fulfill({ json: feedback })
    if (path.endsWith('/resolution')) return route.fulfill({ json: feedback })
    return route.fulfill({ json: feedback })
  })
}

test.beforeEach(async ({ page }) => mockCandidateApi(page))

// Desktop opens feedback from the sidebar; phones have no sidebar and use the portfolio settings menu.
async function openFeedback(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) >= 768) return page.getByRole('button', { name: 'Send feedback' }).click()
  await page.goto('/portfolio')
  // An unread tester announcement sits over the portfolio's top-right settings button until it is dismissed.
  const notice = page.getByRole('region', { name: 'Unread tester announcement' })
  if (await notice.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await notice.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: /^Settings/ }).click()
  await page.getByRole('menuitem', { name: 'Feedback', exact: true }).click()
}

async function popoverColor(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'bg-popover'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
}

test('feedback opens from the sidebar above the account, follows the theme, and dismisses back to its trigger', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 551 })
  await page.goto('/plans?coach=open')
  await page.getByRole('button', { name: 'Done', exact: true }).click({ force: true })
  // Feedback lives in the navigation, not the unstable tester bar.
  await expect(page.getByRole('button', { name: /^Feedback/ })).toHaveCount(0)
  const feedbackTrigger = page.getByRole('button', { name: 'Send feedback' })
  const [triggerBox, accountBox] = await Promise.all([feedbackTrigger.boundingBox(), page.getByRole('button', { name: 'Account' }).boundingBox()])
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(accountBox!.y)
  await feedbackTrigger.click()
  const dialog = page.getByRole('dialog', { name: 'Feedback' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Share feedback', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-feedback-1280x551.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(feedbackTrigger).toBeFocused()
  // The account menu no longer carries a duplicate Help & feedback entry.
  await page.getByRole('button', { name: 'Account' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /feedback/i })).toHaveCount(0)
  await page.keyboard.press('Escape')

  for (const theme of ['light', 'dark']) {
    // next-themes follows storage events, so the theme flips without a reload.
    await page.evaluate((value) => {
      localStorage.setItem('theme', value)
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: value }))
    }, theme)
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
    await page.getByRole('button', { name: 'Send feedback' }).click()
    await expect(dialog).toHaveCSS('background-color', await popoverColor(page))
    if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath(`candidate-feedback-${theme}.png`), fullPage: true })
    await page.keyboard.press('Escape')
  }

  await page.goto('/admin/platform/feedback')
  await page.getByRole('button', { name: 'Done', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('background-color', await popoverColor(page))
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('tester sees announcements and can paste a screenshot into quick feedback', async ({ page }, testInfo) => {
  await page.goto('/plans?coach=open')
  await expect(page.getByText('Unstable', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Unread tester announcement' })).toContainText('Test data refresh Friday')
  await expect(page.getByRole('button', { name: /announcements.*1 unread/i })).toHaveCount(0)
  // Release notes are no longer offered from the tester bar.
  await expect(page.getByRole('button', { name: /what's new/i })).toHaveCount(0)

  await openFeedback(page)
  await expect(page.getByText('Share feedback', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: "I'm stuck" })).toBeVisible()
  await expect(page.getByLabel('1 comment, new activity')).toBeVisible()
  await page.getByRole('button', { name: `Expand feedback: ${feedback.message}` }).click()
  await expect(page.getByRole('button', { name: 'Open save-button.png' })).toBeVisible()
  await expect(page.getByText('Thanks — we are working on this.')).toBeVisible()
  await expect(page.getByText(feedback.key, { exact: true })).toHaveCount(0)
  await expect(page.getByText(feedback.priority, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: `Collapse feedback: ${feedback.message}` }).click()
  await page.getByRole('button', { name: 'Something is broken', exact: true }).click()
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
  await expect(page.getByText('Your submissions')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Feedback' }).getByText('Your original note cannot be edited after it is sent.')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Feedback' }).getByText('Edit', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Feedback' }).getByText('Likely the narrow layout breakpoint.')).toHaveCount(0)
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-feedback.png'), fullPage: true })
  await page.getByRole('button', { name: /^Send$/ }).click()
  await expect(page.getByText('Thanks for the feedback')).toBeVisible()
  await expect(page.getByText('Share feedback', { exact: true })).toBeVisible()
})

test('platform admin sees the Jira-native board and can share a tagged reply', async ({ page }, testInfo) => {
  await page.goto('/admin/platform/feedback')
  await expect(page.getByRole('heading', { name: feedback.message })).toBeVisible()
  await expect(page.getByText('Internal Jira note · Henry')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'In the works' })).toBeVisible()
  await page.getByPlaceholder('Write a comment…').fill('The save button now stays visible while you add items.')
  await page.getByRole('button', { name: 'Share with tester' }).click()
  await page.getByRole('button', { name: 'In Review' }).click()
  await expect(page.getByText('Tester announcements')).toBeVisible()
  if (process.env.UI_TEST_CAPTURE === 'true') await page.screenshot({ path: testInfo.outputPath('candidate-admin-triage.png'), fullPage: true })
})
