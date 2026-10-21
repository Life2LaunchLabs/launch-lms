'use client'

import React from 'react'
import Link from 'next/link'
import { Check, Loader2, Pencil } from 'lucide-react'
import { SectionCard } from '@components/Goals/admin/live/ui'
import { getUriWithOrg } from '@services/config/config'
import { documentSteps } from './documentOps'
import { leafNodes, useRequirementFrameworks } from './StepRequirementLinks'
import { insightsRoutes } from '../insights/reportRoutes'
import TemplateBadgeSection from './TemplateBadgeSection'
import type { TemplateEditing } from './useTemplate'

/** A template at a glance: what it's for, the badge it earns, and which requirements it meets. */
export default function TemplateOverview({ orgslug, orgId, token, editing, readOnly }: { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; readOnly: boolean }) {
  const template = editing.template
  const frameworks = useRequirementFrameworks(orgId, token)
  if (!template) return null
  const linked = new Set(documentSteps(template.document).flatMap(({ step }) => step.requirement_node_uuids || []))
  const coverage = frameworks.map((framework) => {
    const leaves = leafNodes(framework.nodes)
    return { ...framework, total: leaves.length, covered: leaves.filter((node) => linked.has(node.node_uuid)).length }
  }).filter((framework) => framework.covered > 0)

  return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
    <div className="flex min-w-0 flex-col gap-6">
      <TemplateDescription editing={editing} editable={!readOnly && !editing.stale && !template.system_type} />
      <SectionCard title="Requirements it meets">
        {coverage.length ? <div className="space-y-3">{coverage.map((framework) => <div key={framework.framework_uuid}>
          <div className="mb-1 flex justify-between gap-2 text-[13px]"><span className="truncate font-semibold text-gray-900">{framework.name}</span><span className="shrink-0 text-gray-500">{framework.covered} of {framework.total}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-black" style={{ width: `${framework.total ? framework.covered / framework.total * 100 : 0}%` }} /></div>
        </div>)}</div> : <p className="text-sm text-gray-500">No steps are linked to a requirement yet.</p>}
        <Link href={getUriWithOrg(orgslug, insightsRoutes.coverage())} className="mt-3 block text-xs font-bold text-gray-900 hover:text-blue-700">See coverage</Link>
      </SectionCard>
    </div>
    <div className="flex min-w-0 flex-col gap-4">
      <TemplateBadgeSection orgslug={orgslug} orgId={orgId} token={token} templateUuid={template.template_uuid} />
    </div>
  </div></div>
}

/** What learners will work toward, edited in place (saved to the draft). */
function TemplateDescription({ editing, editable }: { editing: TemplateEditing; editable: boolean }) {
  const saved = editing.template?.document.template.description || ''
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(saved)
  React.useEffect(() => { if (!open) setValue(saved) }, [saved, open])
  const save = async () => {
    if (await editing.save((document) => ({ ...document, template: { ...document.template, description: value.trim() } }))) setOpen(false)
  }
  const action = editable ? <button type="button" disabled={editing.saving} onClick={() => open ? void save() : setOpen(true)} aria-label={open ? 'Save description' : 'Edit description'}
    className={open ? 'flex h-7 w-7 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700' : 'flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100'}>
    {editing.saving && open ? <Loader2 size={15} className="animate-spin" /> : open ? <Check size={15} /> : <Pencil size={15} />}
  </button> : null
  return <SectionCard title="Description" action={action}>
    {open ? <textarea autoFocus aria-label="Template description" value={value} rows={4} onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void save(); if (event.key === 'Escape') setOpen(false) }}
      className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black" />
      : <p className="whitespace-pre-line text-sm leading-6 text-gray-700">{saved || (editable ? 'What learners will work toward. Add a description so staff and learners know what this plan is for.' : 'No description yet.')}</p>}
  </SectionCard>
}
