'use client'

import React from 'react'
import Link from 'next/link'
import { Check, ClipboardList, LayoutGrid, Layers3, Loader2, Pencil, Plus, Settings, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { SafeImage } from '@components/Objects/SafeImage'
import { EmptyState } from '@components/Admin/Plans/shared'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { TemplateDetail as Template } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { documentSteps } from './documentOps'
import GoalAssignmentModal from './GoalAssignmentModal'
import TemplateAssignments from './TemplateAssignments'
import TemplateOverview from './TemplateOverview'
import TemplateSettings from './TemplateSettings'
import TemplateSteps from './TemplateSteps'
import TemplateVersionBar from './TemplateVersionBar'
import { StaleTemplateBanner, useTemplate, type TemplateEditing } from './useTemplate'

/** Template tabs; the URL keeps the old `objectives` segment for the steps tab. */
export type TemplateSubpage = 'overview' | 'objectives' | 'assignments' | 'settings'
export const TEMPLATE_SUBPAGES: TemplateSubpage[] = ['overview', 'objectives', 'assignments', 'settings']

const TABS = [
  { key: 'overview' as const, label: 'Overview', icon: LayoutGrid },
  { key: 'objectives' as const, label: 'Steps', icon: ClipboardList },
  { key: 'assignments' as const, label: 'Handed out', icon: Users },
  { key: 'settings' as const, label: 'Settings', icon: Settings },
]

/** The goal template editor: header, version bar, assigning, and one tab of the draft. */
export default function TemplateDetail({ orgslug, templateUuid, subpage = 'overview' }: { orgslug: string; templateUuid: string; subpage?: TemplateSubpage }) {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const editing = useTemplate(orgId, templateUuid, token)
  const template = editing.template
  if (editing.error && !template) return <div className="p-10"><EmptyState title="Template not found" detail="It may have been removed, or you can't manage templates in this organization." /></div>
  if (!template) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const page = (key: TemplateSubpage) => getUriWithOrg(orgslug, routePaths.org.dash.programPage(templateUuid, key))
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 text-sm tracking-tight nice-shadow">
      <div className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Goals', href: getUriWithOrg(orgslug, routePaths.org.dash.plans()) }, { label: 'Templates', href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) }, { label: template.title }]} />
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Template · edits are a draft until you publish; goals already handed out keep their version</p>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1"><TemplateHeader template={template} editing={editing} /></div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-1">
          <TemplateVersionBar orgId={orgId} token={token} editing={editing} />
          <Link href={page('objectives')} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-muted">Edit steps</Link>
          {template.status === 'archived' ? null : <GoalAssignmentModal initialTemplateUuid={template.template_uuid} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85"><Plus size={15} />Assign</button>} />}
        </div>
      </div>
      <div className="flex space-x-3 text-sm font-black">{TABS.map((tab) => {
        const Icon = tab.icon
        return <Link key={tab.key} href={page(tab.key)} aria-current={subpage === tab.key ? 'page' : undefined}><div className={cn('flex w-fit cursor-pointer space-x-4 border-black py-2 text-center transition-all ease-linear', subpage === tab.key ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><div className="mx-2 flex items-center space-x-2.5"><Icon size={16} /><div>{tab.label}</div></div></div></Link>
      })}</div>
    </div>
    <StaleTemplateBanner editing={editing} />
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
      {subpage === 'overview' && <TemplateOverview orgslug={orgslug} orgId={orgId} token={token} template={template} />}
      {subpage === 'objectives' && <TemplateSteps orgslug={orgslug} orgId={orgId} token={token} editing={editing} />}
      {subpage === 'assignments' && <TemplateAssignments orgslug={orgslug} orgId={orgId} token={token} templateUuid={templateUuid} />}
      {subpage === 'settings' && <TemplateSettings orgslug={orgslug} orgId={orgId} token={token} editing={editing} />}
    </motion.div>
  </div>
}

function TemplateHeader({ template, editing }: { template: Template; editing: TemplateEditing }) {
  const meta = template.document.template
  const [field, setField] = React.useState<'title' | 'description' | null>(null)
  const [title, setTitle] = React.useState(meta.title)
  const [description, setDescription] = React.useState(meta.description || '')
  React.useEffect(() => { if (!field) { setTitle(meta.title); setDescription(meta.description || '') } }, [meta.title, meta.description, field])
  const save = async () => {
    if (field === 'title' && !title.trim()) return
    const patch = field === 'title' ? { title: title.trim() } : { description: description.trim() }
    if (await editing.save((document) => ({ ...document, template: { ...document.template, ...patch } }))) setField(null)
  }
  const cancel = () => setField(null)
  const steps = documentSteps(template.document).length
  return <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
    <div className="relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
      {template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="Template cover" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-blue-500"><Layers3 size={42} strokeWidth={1.4} /></div>}
    </div>
    <div className="min-w-0 flex-1">
      <div className="group flex min-w-0 items-start gap-2">
        {field === 'title' ? <input autoFocus aria-label="Template title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') cancel() }} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-black leading-tight outline-none focus:ring-2 focus:ring-black" />
          : <h1 className="min-w-0 break-words text-3xl font-black leading-tight text-foreground">{meta.title}</h1>}
        <EditButton editing={field === 'title'} saving={editing.saving && field === 'title'} disabled={editing.stale || !!template.system_type} label="title" onClick={() => field === 'title' ? void save() : setField('title')} />
      </div>
      <div className="group mt-2 flex max-w-3xl items-start gap-2">
        {field === 'description' ? <textarea autoFocus aria-label="Template description" value={description} rows={3} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void save(); if (event.key === 'Escape') cancel() }} className="min-w-0 flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black" />
          : <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{meta.description || 'What learners will work toward.'}</p>}
        <EditButton editing={field === 'description'} saving={editing.saving && field === 'description'} disabled={editing.stale || !!template.system_type} label="description" onClick={() => field === 'description' ? void save() : setField('description')} />
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{template.document.stages.length} stage{template.document.stages.length === 1 ? '' : 's'} · {steps} step{steps === 1 ? '' : 's'}</p>
    </div>
  </div>
}

function EditButton({ editing, saving, disabled, label, onClick }: { editing: boolean; saving: boolean; disabled: boolean; label: string; onClick: () => void }) {
  if (disabled) return null
  return <button type="button" disabled={saving} onClick={onClick} aria-label={editing ? `Save ${label}` : `Edit ${label}`} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', editing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100')}>{saving ? <Loader2 size={15} className="animate-spin" /> : editing ? <Check size={15} /> : <Pencil size={15} />}</button>
}
