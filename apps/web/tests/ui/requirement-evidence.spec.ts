import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { assertActualApp } from './auth'

const fixture = JSON.parse(readFileSync('.playwright/requirement-evidence.json', 'utf8'))
const insightsPath = `/orgs/${fixture.org_slug}/admin/insights`

async function capture(page: Page, info: TestInfo, name: string, fullPage = true) {
  const screenshot = await page.screenshot({ path: info.outputPath(name), fullPage })
  await info.attach(`synthetic-review:${name}`, { body: screenshot, contentType: 'image/png' })
}

test('requirements.export: assignment filters learners and downloads real reviewed evidence', async ({ page }, testInfo) => {
  await page.goto(`/orgs/${fixture.org_slug}/admin/plans/assignments/${fixture.assignment_uuid}/learners`)
  await assertActualApp(page)
  await page.getByRole('textbox', { name: 'Search learners' }).fill('Alex')
  const action = page.getByRole('button', { name: 'Export evidence CSV for 1 filtered learner', exact: true })
  await expect(action).toBeVisible()
  await action.focus()
  await action.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(async () => {
    const box = await page.getByRole('dialog').boundingBox()
    return Boolean(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width)
  }).toBe(true)
  await page.getByLabel('Course name (optional)').fill('Higher Education and Career Path Skills')
  await page.getByLabel('Course code (optional)').fill('22900')
  await page.getByLabel('Section (optional)').fill('Senior advisory A')
  await page.getByLabel('Term (optional)').fill('Fall 2026')
  await capture(page, testInfo, 'export-course-context.png', false)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('requirement-evidence.csv')
  const csv = readFileSync((await download.path())!, 'utf8')
  expect(csv).toContain('Alex Approved')
  expect(csv).not.toContain('Parker Pending')
  expect(csv).toContain('HS.HECPS.D.2')
  expect(csv).toContain('HS.HECPS.D.3')
  expect(csv).toContain('Staff-approved step')
  expect(csv).toContain('Resume reflection')
  expect(csv).toContain('https://example.org/synthetic-resume')
  expect(csv).toContain('22900')
  expect(csv).toContain('Fall 2026')
  expect(csv).toContain('No mapped work in export scope')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(action).toBeFocused()
  await capture(page, testInfo, 'assignment-export-filtered.png')
  await page.getByRole('textbox', { name: 'Search learners' }).fill('no-such-learner')
  await expect(page.getByRole('button', { name: 'Export evidence CSV for 0 filtered learners' })).toBeDisabled()
})

test('requirements.export: Insights group evidence keeps pending evidence and shows server failures', async ({ page }, testInfo) => {
  await page.goto(`${insightsPath}/evidence?group=${fixture.group_id}`)
  await assertActualApp(page)
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveValue(String(fixture.group_id))
  await page.getByRole('button', { name: 'Export evidence CSV for 2 filtered learners' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  const csv = readFileSync((await (await downloadPromise).path())!, 'utf8')
  expect(csv).toContain('Parker Pending')
  expect(csv).toContain('Awaiting staff review')
  expect(csv).toContain('Staff-approved step')
  await capture(page, testInfo, 'group-requirement-export.png')
  await page.route('**/goal-admin/requirements/evidence-export?*', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'You cannot export this learner’s assignment' }) }))
  await page.getByRole('button', { name: 'Export evidence CSV for 2 filtered learners' }).click()
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  await expect(page.getByText('You cannot export this learner’s assignment', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export evidence CSV for 2 filtered learners' })).toBeFocused()
})

test('insights.report: a group report includes a framework as a draft section and prints on its own page', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(`${insightsPath}?group=${fixture.group_id}`)
  await assertActualApp(page)
  await expect(page.getByRole('combobox', { name: 'Group' })).toHaveValue(String(fixture.group_id))
  await expect(page.getByRole('heading', { name: 'Plans and badges' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Who's behind and what's left/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alex Approved' }).first()).toBeVisible()
  await page.getByRole('checkbox', { name: 'Oregon SB3 synthetic evidence' }).check()
  await expect(page).toHaveURL(new RegExp(`fw=${fixture.framework_uuid}`))
  // The included framework embeds the group's requirement grid, with its evidence export.
  await expect(page.getByRole('button', { name: /Export evidence CSV for 2 filtered learners/ })).toBeVisible()
  await capture(page, testInfo, 'group-report.png')
  const print = page.getByRole('link', { name: 'Print report' })
  await expect(print).toHaveAttribute('href', new RegExp(`/admin/insights/reports/${fixture.group_id}/print\\?fw=`))
  // The print page opens the print dialog once it loads; keep it from blocking the test.
  await page.addInitScript(() => { window.print = () => {} })
  await page.goto(`${insightsPath}/reports/${fixture.group_id}/print?fw=${fixture.framework_uuid}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to report' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByText('Alex Approved', { exact: true }).first()).toBeVisible()
  await capture(page, testInfo, 'group-report-print.png')
})

test('requirements.long-codes: explorer and learner tree preserve readable code and title', async ({ page }, testInfo) => {
  // This scenario visits two routes; local Next dev can compile both from cold.
  test.setTimeout(60_000)
  for (const [path, prefix] of [
    [`${insightsPath}/coverage`, 'explorer'],
    [`/orgs/${fixture.org_slug}/admin/users/user/${fixture.approved_username}`, 'learner'],
  ]) {
    await page.goto(path)
    await assertActualApp(page)
    if (prefix === 'explorer') {
      // The inventory is asynchronous; choose our fixture after its header renders.
      await expect(page.getByRole('link', { name: 'Edit framework', exact: true })).toBeVisible()
      const selector = page.getByRole('combobox', { name: 'Framework', exact: true })
      if (await selector.count()) {
        await selector.selectOption(fixture.framework_uuid)
        await expect(selector).toHaveValue(fixture.framework_uuid)
      }
    } else {
      // A profile opens on Overview; the requirement tree lives under Plans.
      await page.getByRole('link', { name: /^Plans · \d+$/ }).click()
      await expect(page).toHaveURL(/[?&]tab=plans/)
    }
    const code = page.getByText('HS.HECPS', { exact: true }).first()
    const title = page.getByText('Higher Education and Career Path Skills', { exact: true }).first()
    await expect(code).toBeVisible()
    await expect(title).toBeVisible()
    const codeBox = (await code.boundingBox())!, titleBox = (await title.boundingBox())!
    expect(codeBox.x + codeBox.width <= titleBox.x + 1 || codeBox.y + codeBox.height <= titleBox.y + 1).toBe(true)
    const domain = prefix === 'explorer'
      ? page.getByRole('treeitem', { name: /HS.HECPS.D Workforce Readiness/ })
      : page.getByRole('button', { name: /HS.HECPS.D Workforce Readiness/ })
    await domain.click()
    await expect(page.getByText('HS.HECPS.D.2', { exact: true }).first()).toBeVisible()
    await capture(page, testInfo, `${prefix}-long-codes.png`)
  }
})
