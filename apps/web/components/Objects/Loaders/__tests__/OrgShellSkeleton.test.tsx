import { describe, expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { OrgShellSkeleton, orgShellKind } from '@components/Objects/Loaders/OrgShellSkeleton'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('org pages show placeholder cards while the org loads, not a white page (FEED-90)', () => {
  test('picks the shell from the path', () => {
    expect(orgShellKind('/discover/plans/goal_template_abc')).toBe('learner')
    expect(orgShellKind('/orgs/acme/plans')).toBe('learner')
    expect(orgShellKind('/')).toBe('learner')
    expect(orgShellKind('/admin/insights')).toBe('admin')
    expect(orgShellKind('/orgs/acme/admin')).toBe('admin')
    expect(orgShellKind('/plans/abc/steps/s1/activity')).toBe('focused')
    expect(orgShellKind('/first-phase')).toBe('focused')
    expect(orgShellKind('/insights/shared/tok')).toBe('focused')
    expect(orgShellKind('/administrators')).toBe('learner')
  })

  test('a learner page renders the menu, the bottom bar and page cards on the server', () => {
    const html = renderToStaticMarkup(<OrgShellSkeleton pathname="/discover/plans/goal_template_abc" />)
    expect(html).toContain('data-org-loading="learner"')
    expect(html).toContain('data-skeleton="menu"')
    expect(html).toContain('data-skeleton="bottom-bar"')
    expect(html).toContain('data-skeleton="page"')
    expect(html).toContain('role="status"')
  })

  test('a focused activity has no menu', () => {
    const html = renderToStaticMarkup(<OrgShellSkeleton pathname="/activity/abc" />)
    expect(html).toContain('data-org-loading="focused"')
    expect(html).not.toContain('data-skeleton="menu"')
  })

  test('the org layout asks OrgProvider for it, and OrgProvider no longer waits on an empty div there', () => {
    expect(source('../../../../app/orgs/[orgslug]/layout.tsx')).toContain('<OrgProvider orgslug={params.orgslug} loadingShell>')
    const provider = source('../../../Contexts/OrgContext.tsx')
    expect(provider).toContain('<OrgShellSkeleton pathname={pathname} />')
    expect(provider).toContain('if (!org || !session) return loading')
  })

  test('moving between learner pages shows placeholder cards, not a full-screen spinner', () => {
    const loading = source('../../../../app/orgs/[orgslug]/(withmenu)/loading.tsx')
    expect(loading).toContain('<PageContentSkeleton />')
    expect(loading).not.toContain('PageLoading')
  })
})
