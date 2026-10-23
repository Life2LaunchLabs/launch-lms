import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { assertActualApp } from './auth'

const fixture = JSON.parse(readFileSync('.playwright/learner-flow.json', 'utf8'))
const orgPath = `/orgs/${fixture.org_slug}`
const frameworkPath = (uuid: string, tab: string) => `${orgPath}/admin/plans/requirements/${uuid}/${tab}`
// Goals have no slug; the seed writes goal_uuid (equal to the old plan uuid).
const goalId: string = fixture.goal_uuid || fixture.plan_uuid || fixture.plan_slug

async function capture(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' })
  await info.attach(`synthetic-review:${name}`, { body: screenshot, contentType: 'image/png' })
}

async function freshFramework(page: Page, levels: any[] = []) {
  const loaded = page.waitForResponse((response) => response.url().includes(`/requirement-frameworks/${fixture.framework_uuid}?`) && response.request().method() === 'GET')
  await page.goto(frameworkPath(fixture.framework_uuid, 'spec'))
  await assertActualApp(page)
  const response = await loaded
  const authorization = (await response.request().allHeaders()).authorization
  const api = response.url().split(`/requirement-frameworks/${fixture.framework_uuid}`)[0]
  const root = `root-${randomUUID()}`, domain = `domain-${randomUUID()}`, leaf = `leaf-${randomUUID()}`
  const nodes = [
    { node_uuid: root, code: 'HS.HECPS', title: 'Career Path Skills', metadata: { source: 'page 1' } },
    { node_uuid: domain, parent_node_uuid: root, code: 'HS.HECPS.D', title: 'Workforce Readiness' },
    { node_uuid: leaf, parent_node_uuid: domain, code: 'HS.HECPS.D.2', title: 'Resume and portfolio', metadata: { source: 'page 4' } },
  ]
  const created = await page.request.post(`${api}/requirement-frameworks`, { headers: { authorization }, data: { org_id: fixture.org_id, name: 'Imported framework browser test', source_metadata: { source_url: 'https://example.org/standards', requirement_levels: levels }, nodes } })
  expect(created.ok()).toBe(true)
  const framework = await created.json()
  return { framework, nodes, authorization, url: `${api}/requirement-frameworks/${framework.framework_uuid}?org_id=${fixture.org_id}` }
}

test('framework.manual: existing hierarchy is editable and publish preserves supplied codes', async ({ page }, info) => {
  test.setTimeout(60_000)
  const { framework, nodes, url, authorization } = await freshFramework(page)
  await page.goto(frameworkPath(framework.framework_uuid, 'levels'))
  await expect(page.getByText(/free-form hierarchy with supplied codes/)).toBeVisible()
  await capture(page, info, 'manual-framework-levels.png')
  await page.getByRole('link', { name: 'Spec', exact: true }).click()
  await expect(page.getByText('HS.HECPS.D.2 · Resume and portfolio', { exact: true })).toBeVisible()
  await page.getByText('HS.HECPS.D.2 · Resume and portfolio', { exact: true }).click()
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('HS.HECPS.D.2')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.getByLabel('Description', { exact: true }).fill('Teacher-reviewed portfolio evidence')
  await page.getByRole('button', { name: 'Save specification' }).click()
  await expect(page.getByText('Framework specification saved.', { exact: true })).toBeVisible()
  await capture(page, info, 'manual-framework-spec.png')
  const saved = await (await page.request.get(url, { headers: { authorization } })).json()
  expect(saved.nodes.map((node: any) => [node.node_uuid, node.parent_node_uuid, node.code, node.metadata])).toEqual(nodes.map((node) => [node.node_uuid, node.parent_node_uuid || null, node.code, node.metadata || {}]))
  await page.getByRole('button', { name: 'Publish version', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Publish version', exact: true })).toBeDisabled()
  const published = await (await page.request.get(url, { headers: { authorization } })).json()
  expect(published.status).toBe('published')
  expect(published.nodes).toEqual(saved.nodes)
  expect(published.source_metadata).toEqual(saved.source_metadata)
})

test('framework.generated: deliberate level conversion can be canceled and generated codes still work', async ({ page }) => {
  test.setTimeout(60_000)
  const levels = ['Subject', 'Domain', 'Standard'].map((name, index) => ({ level_uuid: `level-${randomUUID()}`, name, code_style: index === 0 ? 'upper_alpha' : 'decimal', metadata_fields: [] }))
  const { framework } = await freshFramework(page, levels)
  await page.goto(frameworkPath(framework.framework_uuid, 'spec'))
  await expect(page.getByLabel('Generated requirement code')).toHaveText('A')
  await page.getByText('A.1.1 · Resume and portfolio', { exact: true }).click()
  await expect(page.getByLabel('Generated requirement code')).toHaveText('A.1.1')
  await page.getByRole('button', { name: 'Save specification' }).click()
  await expect(page.getByText('Framework specification saved.', { exact: true })).toBeVisible()
  const manual = await freshFramework(page)
  await page.goto(frameworkPath(manual.framework.framework_uuid, 'levels'))
  for (const name of ['Subject', 'Domain', 'Standard']) {
    await page.getByRole('button', { name: 'Add level', exact: true }).click()
    await page.getByLabel('Level name', { exact: true }).last().fill(name)
  }
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('replaces all supplied requirement codes'); await dialog.dismiss() })
  await page.getByRole('button', { name: 'Save levels' }).click()
  const preserved = await (await page.request.get(manual.url, { headers: { authorization: manual.authorization } })).json()
  expect(preserved.source_metadata.requirement_levels).toEqual([])
  expect(preserved.nodes.map((node: any) => node.code)).toEqual(['HS.HECPS', 'HS.HECPS.D', 'HS.HECPS.D.2'])
})

test('framework.list: Requirements lists frameworks with coverage and opens coverage by plan', async ({ page }, info) => {
  test.setTimeout(60_000)
  const listed = page.waitForResponse((response) => response.url().includes('/requirement-frameworks?') && response.url().includes('with_coverage=true') && response.request().method() === 'GET')
  await page.goto(`${orgPath}/admin/plans/requirements`)
  await assertActualApp(page)
  expect((await listed).ok()).toBe(true)
  await expect(page.getByRole('link', { name: 'Add from Discover' })).toHaveAttribute('href', /\/admin\/plans\/discover$/)
  await expect(page.getByRole('button', { name: 'Create framework' })).toBeVisible()
  const row = page.getByRole('list', { name: 'Requirement frameworks' }).getByRole('link').filter({ hasText: 'Manual code editor test' }).first()
  await expect(row).toContainText(/\d+ of \d+ covered by \d+ templates?/)
  await expect(row).not.toContainText('view only')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await capture(page, info, 'requirements-list.png')

  await page.getByRole('searchbox', { name: 'Search frameworks' }).fill('no framework is called this')
  await expect(page.getByText('No frameworks match.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()

  await row.click()
  await expect(page).toHaveURL(new RegExp(`/admin/plans/requirements/${fixture.framework_uuid}/plans$`))
  await expect(page.getByRole('link', { name: 'Coverage by plan' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'All plans' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tree', { name: 'Requirements' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create framework' })).toHaveCount(0)
  await capture(page, info, 'framework-coverage-by-plan.png')
})

test('goals.invitation: organization and personal inviter are visible with the role', async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.goto(`${orgPath}/plans`)
  await assertActualApp(page)
  // Invitation cards use a shared bordered row rather than a semantic article.
  const organizationRow = page.getByText('Organization invitation test', { exact: true }).locator('..').locator('..')
  await expect(organizationRow).toContainText(fixture.org_name)
  const personalRow = page.getByText('Personal invitation test', { exact: true }).locator('..').locator('..')
  await expect(personalRow).toContainText('Personal Inviter')
  await expect(personalRow).toContainText('Help as Viewer')
  await expect(page.getByText('A goal for you', { exact: true })).toHaveCount(0)
  await expect(organizationRow.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled()
  await capture(page, info, 'goal-inviting-organization.png')
})

test('goals.path: pending work looks finished and activity plays without navigation or Coach', async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.goto(`${orgPath}/plans/${goalId}`)
  await assertActualApp(page)
  const pending = page.locator(`[data-step-shell="${fixture.pending_uuid}"]`)
  const active = page.locator(`[data-step-shell="${fixture.activity_uuid}"]`)
  await expect(pending).toContainText('Waiting on review')
  await expect(pending.locator('.path-node-current')).toHaveCount(0)
  await expect(active.locator('.path-node-current')).toBeVisible()
  await pending.getByRole('button', { name: /Welcome submission, Waiting on review/ }).click()
  await expect(pending.getByText('Handed in. Waiting on review.', { exact: true })).toBeVisible()
  await expect(pending.getByRole('button', { name: /Start|Continue/ })).toHaveCount(0)
  await expect(pending.getByRole('button', { name: 'Ask Coach', exact: true })).toHaveCount(0)
  await capture(page, info, 'step-waiting-review.png')
  await active.getByRole('button', { name: /^Practice activity(, |$)/ }).first().click()
  await active.getByRole('button', { name: 'Ask Coach', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Coach', exact: true })).toBeVisible()
  const composer = page.getByLabel('Ask a question or search Launch LMS')
  await expect(composer).toBeVisible()
  await composer.fill('A draft to keep while practicing')
  // Tuck Coach, then enter through the real activity action using client navigation.
  await page.getByRole('button', { name: 'Show the page', exact: true }).click()
  await active.getByRole('button', { name: /^(Start|Continue)$/ }).click()
  await expect(page.locator('[data-focused-activity]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-learning-activity-surface]')).toBeVisible()
  await expect(page.getByText('Take a moment to practice.', { exact: true })).toBeVisible()
  await expect(page.locator('.hub-shell')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Coach', exact: true })).not.toBeVisible()
  await expect(page.locator('.org-page-layout')).toHaveCount(0)
  const box = (await page.locator('[data-learning-activity-surface]').boundingBox())!
  expect(box.x).toBe(0)
  expect(box.y).toBe(0)
  expect(box.width).toBe(page.viewportSize()!.width)
  expect(box.height).toBe(page.viewportSize()!.height)
  await capture(page, info, 'focused-activity.png')
  await page.getByRole('button', { name: 'Close activity', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/plans/${goalId}`))
  await expect(page.locator('.hub-shell')).toBeVisible()
  await page.getByRole('button', { name: /Open Coach/ }).click()
  await expect(composer).toBeVisible()
  await expect(composer).toHaveValue('A draft to keep while practicing')
})
