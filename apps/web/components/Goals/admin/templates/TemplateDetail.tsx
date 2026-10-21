'use client'

import React from 'react'
import Link from 'next/link'
import { Award, Check, ClipboardList, LayoutGrid, Layers3, Loader2, Pencil, Plus, Settings, Store, Users } from 'lucide-react'
import OwnershipChip, { ReadOnlyNote } from '@components/Admin/Plans/OwnershipChip'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { useFeatures } from '@components/Hooks/useFeatures'
import { motion } from 'motion/react'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
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
  { key: 'overview' as const, label: 'Overview', icon: LayoutGrid },
  { key: 'objectives' as const, label: 'Steps', icon: ClipboardList },
  { key: 'assignments' as const, label: 'Assignments', icon: Users },
  { key: 'publish' as const, label: 'Publish', icon: Store },
  { key: 'settings' as const, label: 'Settings', icon: Settings },
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
    <div className="relative z-10 bg-[#fcfbfc] px-4 text-sm tracking-tight nice-shadow sm:px-10">
      <div className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'Plans', href: getUriWithOrg(orgslug, routePaths.org.admin.plans()) }, { label: 'Templates', href: getUriWithOrg(orgslug, routePaths.org.admin.plans('templates')) }, { label: template.title }]} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1"><TemplateHeader template={template} editing={editing} readOnly={readOnly} /></div>
        <div className="flex max-w-full flex-wrap gap-2 pt-1 sm:shrink-0 sm:justify-end">
          {readOnly ? <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold">{template.published_version ? `Version ${template.published_version} live` : 'Not released yet'}</span>
            : <TemplateVersionBar orgId={orgId} token={token} editing={editing} />}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <OwnershipChip owned={owned} canEdit={!readOnly} ownerName={ownerName} />
        {badges.map((badge) => <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid, 'analytics'))} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200">
          <Award size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">Earns {badge.name}</span>
        </Link>)}
      </div>
      {readOnly ? <ReadOnlyNote className="mb-4">{owned
        ? 'You can see every stage, step and assignment here. Your organization’s admins edit, release and archive templates.'
        : `${ownerName || 'Another organization'} owns this template and keeps it up to date. You can view and assign it; you decide when your assignments move to a new version${badges.length ? `, and finishers earn the badge from ${ownerName || 'its owner'}` : ''}.`}</ReadOnlyNote> : null}
      {/* On a phone the tabs scroll sideways inside their row instead of widening the page. */}
      <div className="-mx-4 flex space-x-3 overflow-x-auto px-4 text-sm font-black [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0">{tabs.map((tab) => {
        const Icon = tab.icon
        return <Link key={tab.key} href={page(tab.key)} aria-current={shown === tab.key ? 'page' : undefined} className="shrink-0 whitespace-nowrap"><div className={cn('flex w-fit cursor-pointer space-x-4 border-black py-2 text-center transition-all ease-linear', shown === tab.key ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><div className="mx-2 flex items-center space-x-2.5"><Icon size={16} /><div>{tab.label}</div></div></div></Link>
      })}</div>
    </div>
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
  return <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
    <div className="relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
      {template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="Template cover" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-blue-500"><Layers3 size={42} strokeWidth={1.4} /></div>}
    </div>
    <div className="min-w-0 flex-1">
      <div className="group flex min-w-0 items-start gap-2">
        {field ? <input autoFocus aria-label="Template title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') setField(false) }} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-black leading-tight outline-none focus:ring-2 focus:ring-black" />
          : <h1 className="min-w-0 break-words text-3xl font-black leading-tight text-foreground">{meta.title}</h1>}
        <EditButton editing={field} saving={editing.saving && field} disabled={readOnly || editing.stale || !!template.system_type} label="title" onClick={() => field ? void save() : setField(true)} />
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{template.document.stages.length} stage{template.document.stages.length === 1 ? '' : 's'} · {steps} step{steps === 1 ? '' : 's'}</p>
    </div>
  </div>
}

function EditButton({ editing, saving, disabled, label, onClick }: { editing: boolean; saving: boolean; disabled: boolean; label: string; onClick: () => void }) {
  if (disabled) return null
  return <button type="button" disabled={saving} onClick={onClick} aria-label={editing ? `Save ${label}` : `Edit ${label}`} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', editing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100')}>{saving ? <Loader2 size={15} className="animate-spin" /> : editing ? <Check size={15} /> : <Pencil size={15} />}</button>
}
