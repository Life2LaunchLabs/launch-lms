'use client'

import React from 'react'
import Link from 'next/link'
import { Award, Check, Layers3, Loader2, Pencil, Plus } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import OwnershipChip, { ReadOnlyNote } from '@components/Admin/Plans/OwnershipChip'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { useFeatures } from '@components/Hooks/useFeatures'
import { motion } from 'motion/react'
import { SafeImage } from '@components/Objects/SafeImage'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { TemplateDetail as Template } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { documentSteps } from './documentOps'
import GoalAssignmentModal from './GoalAssignmentModal'
import { TemplateAssignments } from '../assignments/AssignmentsList'
import TemplateOverview from './TemplateOverview'
import TemplatePublish, { showsPublishTab } from './TemplatePublish'
import TemplateSettings from './TemplateSettings'
import TemplateSteps from './TemplateSteps'
import TemplateVersionBar from './TemplateVersionBar'
import { StaleTemplateBanner, useTemplate, type TemplateEditing } from './useTemplate'
import { TemplateProvenance } from '@components/Admin/Marketplace/TemplateMarketplaceListing'

/** Template tabs; the URL keeps the old `objectives` segment for the steps tab. */
export type TemplateSubpage = 'overview' | 'objectives' | 'assignments' | 'publish' | 'settings'

const TABS = [
  { key: 'overview' as const, label: 'Overview' },
  { key: 'objectives' as const, label: 'Steps' },
  { key: 'assignments' as const, label: 'Assignments' },
  { key: 'publish' as const, label: 'Publish' },
  { key: 'settings' as const, label: 'Settings' },
]

/** The goal template editor: header (title, cover, version bar) and one tab of the draft. */
export default function TemplateDetail({ orgslug, templateUuid, subpage = 'overview' }: { orgslug: string; templateUuid: string; subpage?: TemplateSubpage }) {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const editing = useTemplate(orgId, templateUuid, token)
  const canAssign = useCanEditPlans() === true
  const features = useFeatures()
  const template = editing.template
  if (editing.error && !template) return <div className="p-10"><EmptyState title="Template not found" detail="It may have been removed, or your organization isn't allowed to run it. Templates other organizations share are in Plans › Marketplace." /></div>
  if (!template) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const page = (key: TemplateSubpage) => getUriWithOrg(orgslug, routePaths.org.admin.templatePage(templateUuid, key))
  // Read-only: another organization's template this one runs, or staff (not admins) viewing one of the organization's own.
  const readOnly = !!template.read_only
  const owned = Number(template.org_id) === orgId
  const ownerName = template.owner_org?.name || template.badge?.owner_org?.name || null
  // Another organization's template keeps a Settings tab for this organization's own setting: who can start it here.
  // Publish (the marketplace and who else may run it) is the owner's, for organizations that may publish.
  const publishes = showsPublishTab(template, owned, readOnly, features)
  const hidden = (key: TemplateSubpage) => (key === 'settings' && readOnly && owned) || (key === 'publish' && !publishes)
  const tabs = TABS.filter((tab) => !hidden(tab.key))
  const shown: TemplateSubpage = hidden(subpage) ? 'overview' : subpage
  const assign = template.status === 'archived' || !canAssign || (!owned && !template.published_version) ? null
    : <GoalAssignmentModal initialTemplateUuid={template.template_uuid} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85"><Plus size={15} />Assign</button>} />
  const badges = template.badges?.length ? template.badges : template.badge ? [template.badge] : []
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    {/* The same header as an assignment: breadcrumb, title and facts, actions on the right, then tabs. */}
    <header className="border-b border-border bg-background px-4 pt-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground md:min-h-0">
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Plans</Link>
          <CaretRight size={12} aria-hidden="true" />
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans('templates'))} className="hover:text-foreground">Templates</Link>
          <CaretRight size={12} aria-hidden="true" />
          <span aria-current="page" className="min-w-0 truncate text-foreground">{template.title}</span>
        </nav>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <TemplateHeader template={template} editing={editing} readOnly={readOnly} />
          <div className="flex max-w-full shrink-0 flex-wrap gap-2">
            {readOnly ? <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold">{template.published_version ? `Version ${template.published_version} live` : 'Not released yet'}</span>
              : <TemplateVersionBar orgId={orgId} token={token} editing={editing} />}
          </div>
        </div>
        {badges.length || readOnly || !owned ? <div className="mt-3 flex flex-wrap items-center gap-2">
          <OwnershipChip owned={owned} canEdit={!readOnly} ownerName={ownerName} />
          {badges.map((badge) => <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid, 'analytics'))} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200">
            <Award size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">Earns {badge.name}</span>
          </Link>)}
        </div> : null}
        {readOnly ? <ReadOnlyNote className="mt-4">{owned
          ? 'You can see every stage, step and assignment here. Your organization’s admins edit, release and archive templates.'
          : `${ownerName || 'Another organization'} owns this template and keeps it up to date. You can view and assign it; you decide when your assignments move to a new version${badges.length ? `, and finishers earn the badge from ${ownerName || 'its owner'}` : ''}.`}</ReadOnlyNote> : null}
        {/* On a phone the tabs scroll sideways inside their row instead of widening the page. */}
        <nav aria-label="Template" className="-mx-4 mt-5 flex gap-1 overflow-x-auto px-4 text-sm font-black [scrollbar-width:none] sm:mx-0 sm:px-0">
          {tabs.map((tab) => <Link key={tab.key} href={page(tab.key)} aria-current={shown === tab.key ? 'page' : undefined}
            className={cn('shrink-0 whitespace-nowrap border-b-4 px-3 py-2 transition', shown === tab.key ? 'border-foreground' : 'border-transparent opacity-60 hover:opacity-90')}>{tab.label}</Link>)}
        </nav>
      </div>
    </header>
    <StaleTemplateBanner editing={editing} />
    <TemplateProvenance template={template} />
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
      {shown === 'overview' && <TemplateOverview orgslug={orgslug} orgId={orgId} token={token} editing={editing} readOnly={readOnly} />}
      {shown === 'objectives' && <TemplateSteps orgslug={orgslug} orgId={orgId} token={token} editing={editing} readOnly={readOnly} />}
      {shown === 'assignments' && <TemplateAssignments orgslug={orgslug} templateUuid={templateUuid} assign={assign} />}
      {shown === 'publish' && <TemplatePublish orgId={orgId} token={token} template={template} />}
      {shown === 'settings' && <TemplateSettings orgId={orgId} token={token} editing={editing} runOnly={readOnly} />}
    </motion.div>
  </div>
}

function TemplateHeader({ template, editing, readOnly }: { template: Template; editing: TemplateEditing; readOnly: boolean }) {
  const meta = template.document.template
  const [field, setField] = React.useState(false)
  const [title, setTitle] = React.useState(meta.title)
  React.useEffect(() => { if (!field) setTitle(meta.title) }, [meta.title, field])
  const save = async () => {
    if (!title.trim()) return
    if (await editing.save((document) => ({ ...document, template: { ...document.template, title: title.trim() } }))) setField(false)
  }
  const steps = documentSteps(template.document).length
  const status = template.status === 'archived' ? { label: 'Archived', cls: 'bg-gray-100 text-gray-600' }
    : template.published_version ? null : { label: 'Not released', cls: 'bg-amber-50 text-amber-800' }
  return <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-violet-100 text-violet-700">
      {template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Layers3 size={24} aria-hidden="true" />}
    </span>
    <div className="min-w-0 flex-1">
      <div className="group flex min-w-0 flex-wrap items-center gap-2">
        {field ? <input autoFocus aria-label="Template title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') setField(false) }} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-1 text-2xl font-black tracking-tight outline-none focus:ring-2 focus:ring-black" />
          : <h1 className="min-w-0 break-words text-2xl font-black tracking-tight text-foreground">{meta.title}</h1>}
        <EditButton editing={field} saving={editing.saving && field} disabled={readOnly || editing.stale || !!template.system_type} label="title" onClick={() => field ? void save() : setField(true)} />
        {status ? <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase', status.cls)}>{status.label}</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{template.document.stages.length} stage{template.document.stages.length === 1 ? '' : 's'} · {steps} step{steps === 1 ? '' : 's'}</p>
    </div>
  </div>
}

function EditButton({ editing, saving, disabled, label, onClick }: { editing: boolean; saving: boolean; disabled: boolean; label: string; onClick: () => void }) {
  if (disabled) return null
  return <button type="button" disabled={saving} onClick={onClick} aria-label={editing ? `Save ${label}` : `Edit ${label}`} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', editing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100')}>{saving ? <Loader2 size={15} className="animate-spin" /> : editing ? <Check size={15} /> : <Pencil size={15} />}</button>
}
