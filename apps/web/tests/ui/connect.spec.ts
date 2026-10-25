import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { assertActualApp } from './auth'

// Seeded by apps/api/scripts/seed_connect.py; the learner's plans come from seed_learner_flow.py.
const fixture = JSON.parse(readFileSync('.playwright/connect.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const ACTIVE_PLAN = 'Focused learner path'
const PENDING_PLAN = 'Organization invitation test'

async function openChat(page: Page, title: string) {
  await page.goto(`${orgPath}/connect`)
  await assertActualApp(page)
  await page.getByRole('region', { name: 'Chats' }).getByRole('link', { name: new RegExp(title) }).first().click()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
  // Nothing on the page scrolls sideways, on desktop or phone.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

const chatPane = (page: Page) => page.getByRole('region', { name: 'Chat', exact: true })

async function send(page: Page) {
  const sent = page.waitForResponse((response) => /\/connect\/chats\/[^/]+\/messages$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send message' }).click()
  expect((await sent).ok()).toBe(true)
}

test('connect.direct: a friend\'s chat opens and a reply shows up', async ({ page }) => {
  await openChat(page, fixture.friend.name)
  await expect(chatPane(page).getByText('Want to practice interview questions on Thursday?')).toBeVisible()
  const reply = `Thursday works ${randomUUID().slice(0, 8)}`
  await page.getByRole('textbox', { name: 'Message' }).click()
  await page.keyboard.type(reply)
  await send(page)
  await expect(chatPane(page).getByText(reply)).toBeVisible()
  // The composer stays on screen: the message box is reachable without scrolling.
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport()
})

test('connect.tagging: / lists only active plans, and a tagged message files under that plan', async ({ page }) => {
  await openChat(page, fixture.org_name)
  const box = page.getByRole('textbox', { name: 'Message' })
  await box.click()
  await page.keyboard.type('/')
  const picker = page.getByRole('listbox')
  await expect(picker.getByRole('option', { name: new RegExp(ACTIVE_PLAN) }).first()).toBeVisible()
  await expect(picker.getByRole('option', { name: new RegExp(PENDING_PLAN) })).toHaveCount(0)
  await page.keyboard.type('Focused')
  await page.keyboard.press('Tab')
  const note = `can I start ${randomUUID().slice(0, 8)}?`
  await page.keyboard.type(` ${note}`)
  await send(page)
  await expect(chatPane(page).getByText(note)).toBeVisible()
  // The plan now has messages, so its chip shows in the filter; picking it keeps the message.
  const filters = page.getByRole('group', { name: 'Show messages about' })
  await filters.getByRole('button', { name: new RegExp(ACTIVE_PLAN) }).click()
  await expect(page.getByRole('group', { name: `Show messages about ${ACTIVE_PLAN}` })).toBeVisible()
  await expect(chatPane(page).getByText(note)).toBeVisible()
  await expect(filters.getByRole('button', { name: new RegExp(PENDING_PLAN) })).toHaveCount(0)
})

test('people.feed: one list with conversations on top, and a row opens that person\'s thread', async ({ page }) => {
  await page.goto(`${orgPath}/admin/users`)
  await assertActualApp(page)
  const list = page.getByRole('region', { name: 'People and groups' })
  // The friend who wrote to the admin is in the top section; everyone else follows A to Z.
  const friend = list.getByRole('list', { name: 'New for you' }).getByRole('link', { name: new RegExp(fixture.friend.name) })
  await expect(friend).toBeVisible()
  await expect(list.getByRole('heading', { name: 'Everyone else · A–Z' })).toBeVisible()
  // No separate boxes or Chats/Everyone split any more.
  await expect(page.getByRole('tab', { name: 'Direct' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Helpers to approve' })).toHaveCount(0)
  await friend.click()
  // A row opens the thread with that person: their name on top (it opens their profile) and a composer.
  const thread = page.getByRole('region', { name: 'Thread' })
  await expect(thread.locator('button[title="Open profile"]')).toContainText(fixture.friend.name)
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  // Search finds anyone, people and groups alike.
  await page.goto(`${orgPath}/admin/users`)
  await page.getByRole('textbox', { name: /Search people and groups/ }).fill('Casey')
  await expect(page.getByRole('region', { name: 'People and groups' }).getByRole('link', { name: /Casey Reported/ })).toBeVisible()
})

test('connect.reports: admins review a chat report in People and can reopen it', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'People shows reports beside the list on desktop')
  // Start from an open report even if an earlier browser or attempt stopped after resolving it.
  const listed = page.waitForResponse((response) => response.url().includes('/reports?status=open'))
  await page.goto(`${orgPath}/admin/users`)
  await assertActualApp(page)
  const response = await listed
  const reopened = await page.request.put(response.url().replace(/\?status=open$/, `/${fixture.report.report_uuid}`), {
    headers: { authorization: (await response.request().allHeaders()).authorization }, data: { status: 'open' },
  })
  expect(reopened.ok()).toBe(true)
  await page.reload()
  const panel = page.getByRole('region', { name: /Chat reports/ })
  await expect(panel).toBeVisible()
  const row = panel.getByRole('listitem').filter({ hasText: fixture.report.reason })
  await expect(row.getByText(fixture.report.message)).toBeVisible()
  await expect(row.getByText(`${fixture.report.reporter} reported ${fixture.report.reported}`)).toBeVisible()
  await row.getByRole('button', { name: 'Mark resolved' }).click()
  await expect(page.getByText('Report resolved').first()).toBeVisible()
  // Put it back so the next browser and any retry see the same open report.
  await panel.getByRole('button', { name: 'Resolved', exact: true }).click()
  const resolved = panel.getByRole('listitem').filter({ hasText: fixture.report.reason })
  await expect(resolved.getByText(/Resolved by/)).toBeVisible()
  await resolved.getByRole('button', { name: 'Reopen' }).click()
  await expect(page.getByText('Report reopened').first()).toBeVisible()
  await panel.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(panel.getByRole('listitem').filter({ hasText: fixture.report.reason })).toBeVisible()
})
