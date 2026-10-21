import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

// The signed-in test account is the seeded org's admin (and the platform superadmin, so it can act for a partner org too).
const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const PARTNER_SLUG = 'marketplace-partner-ui'

const marketplaceTab = (page: Page) => page.getByRole('navigation', { name: 'Plans pages' }).getByRole('link').filter({ hasText: 'Marketplace' })

/** Opens the marketplace and returns the API base and the bearer header the page uses. */
async function openMarketplace(page: Page, query = '') {
  const summary = page.waitForResponse((res) => res.url().includes('/badge-marketplace/requests/summary') && res.request().method() === 'GET')
  await page.goto(`${orgPath}/admin/plans/marketplace${query}`)
  await assertActualApp(page)
  const response = await summary
  expect(response.ok()).toBe(true)
  return { api: response.url().split('badge-marketplace/')[0], authorization: (await response.request().allHeaders()).authorization }
}

test('marketplace.prefilter: Add from marketplace lands on one kind, with its filter chip', async ({ page }) => {
  await openMarketplace(page, '?type=templates')
  await expect(marketplaceTab(page)).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Templates' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Badges' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Requirement frameworks' })).toHaveCount(0)
  await expect(page.getByText('Type: Templates')).toBeVisible()

  await page.goto(`${orgPath}/admin/plans/marketplace?type=badges`)
  await expect(page.getByRole('region', { name: 'Badges' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Templates' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('marketplace.requests: a request to use a listed template shows on the tab and can be declined', async ({ page }) => {
  const { api, authorization } = await openMarketplace(page)
  const headers = { authorization }

  // List one of the org's published templates, locked and ask-first.
  const templates = await (await page.request.get(`${api}goal-templates?org_id=${fixture.org_id}`, { headers })).json()
  const template = templates.find((item: any) => item.title === 'Focused learner path') || templates.find((item: any) => item.published_version)
  expect(template).toBeTruthy()
  const listed = await page.request.put(`${api}badge-marketplace/templates/${template.template_uuid}/listing?org_id=${fixture.org_id}`, { headers, data: { listed: true, mode: 'locked', access: 'request' } })
  expect(listed.ok()).toBe(true)

  // A partner org asks to run it.
  let partner = await page.request.get(`${api}orgs/slug/${PARTNER_SLUG}`, { headers })
  if (!partner.ok()) partner = await page.request.post(`${api}orgs/`, { headers, data: { name: 'Marketplace Partner', slug: PARTNER_SLUG, email: 'partner@example.org' } })
  expect(partner.ok()).toBe(true)
  const partnerOrg = await partner.json()
  const asked = await page.request.post(`${api}badge-marketplace/template-authorizations`, { headers, data: { template_uuid: template.template_uuid, issuer_org_id: partnerOrg.id, message: 'Browser test' } })
  expect(asked.ok()).toBe(true)
  expect((await asked.json()).status).toBe('requested')

  const waiting = async () => (await (await page.request.get(`${api}badge-marketplace/requests/summary?org_id=${fixture.org_id}`, { headers })).json()).incoming_requested
  const before = await waiting()
  expect(before).toBeGreaterThan(0)
  await page.reload()
  await expect(marketplaceTab(page)).toContainText(`${before} request${before === 1 ? '' : 's'} waiting`)
  await page.getByRole('navigation', { name: 'Marketplace view' }).getByRole('link', { name: /Requests/ }).click()
  await expect(page).toHaveURL(/view=requests/)
  const incoming = page.getByTestId('marketplace-incoming')
  const row = incoming.getByTestId('marketplace-request-row').filter({ hasText: 'Marketplace Partner' }).filter({ hasText: template.title })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Decline' }).click()
  await expect(row).toHaveCount(0)
  // The tab's count follows: one fewer waiting (none shows no count at all).
  if (before === 1) await expect(marketplaceTab(page)).not.toContainText('waiting')
  else await expect(marketplaceTab(page)).toContainText(`${before - 1} request${before - 1 === 1 ? '' : 's'} waiting`)
  expect(await waiting()).toBe(before - 1)

  // Leave the template unlisted for the other scenarios.
  await page.request.put(`${api}badge-marketplace/templates/${template.template_uuid}/listing?org_id=${fixture.org_id}`, { headers, data: { listed: false, mode: 'locked', access: 'request' } })
})

test('marketplace.publish: Publish to marketplace in Template › Settings lists it, and your marketplace shows it as yours', async ({ page }) => {
  const { api, authorization } = await openMarketplace(page)
  const headers = { authorization }
  const templates = await (await page.request.get(`${api}goal-templates?org_id=${fixture.org_id}`, { headers })).json()
  const template = templates.find((item: any) => item.title === 'Focused learner path') || templates.find((item: any) => item.published_version)
  expect(template).toBeTruthy()
  const listingUrl = `${api}badge-marketplace/templates/${template.template_uuid}/listing?org_id=${fixture.org_id}`
  await page.request.put(listingUrl, { headers, data: { listed: false, mode: 'locked', access: 'request' } })

  await page.goto(`${orgPath}/admin/plans/${template.template_uuid}/settings`)
  await assertActualApp(page)
  const card = page.getByTestId('template-marketplace-listing')
  await expect(card.getByText('Not listed')).toBeVisible()
  // One way to publish: there is no separate global-library card.
  await expect(page.getByRole('heading', { name: 'Global template library' })).toHaveCount(0)
  const saved = page.waitForResponse((res) => res.url().includes('/listing') && res.request().method() === 'PUT')
  await card.getByRole('button', { name: 'Publish to marketplace' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(card.getByText('In the marketplace')).toBeVisible()

  await card.getByTestId('template-marketplace-listed').getByRole('link', { name: 'Plans › Marketplace' }).click()
  const ownCard = page.getByRole('region', { name: 'Templates' }).getByTestId('marketplace-card').filter({ hasText: template.title })
  await expect(ownCard.getByText('Yours · listed')).toBeVisible()

  await page.request.put(listingUrl, { headers, data: { listed: false, mode: 'locked', access: 'request' } })
})
