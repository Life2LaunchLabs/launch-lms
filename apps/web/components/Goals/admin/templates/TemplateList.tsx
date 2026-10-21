'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore, Award, ChevronRight, Layers3, ListTree, Loader2, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import FilterBar from '@components/Admin/Filters/FilterBar'
import { useFilters } from '@components/Admin/Filters/useFilters'
import OwnershipChip from '@components/Admin/Plans/OwnershipChip'
import PageWelcome from '@components/Admin/PageWelcome'
import { AddFromMarketplace, primaryActionClass } from '@components/Admin/Plans/PlansActions'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isTemplatesKey, templateKeys, templatesApi, type IssuerBadgeRoute, type TemplateBadgeRef, type TemplateListItem } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { eligibilityLabel } from '@services/goals/versions'
import { isOn, matchesSearch, type FilterSpec } from '@/lib/admin/filters'
import { cn } from '@/lib/utils'

const templatePage = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.templatePage(uuid, 'overview'))

/** Where a template stands: archived, never published, or its live version and whether the draft moved on. */
export function TemplateStatusChip({ template, className }: { template: Pick<GoalTemplate, 'status' | 'published_version' | 'has_unpublished_changes'>; className?: string }) {
  const [label, tone] = template.status === 'archived' ? ['Archived', 'bg-gray-100 text-gray-600']
    : !template.published_version ? ['Not published', 'bg-amber-100 text-amber-800']
      : template.has_unpublished_changes ? [`v${template.published_version} · changes`, 'bg-amber-100 text-amber-800']
        : [`v${template.published_version} live`, 'bg-green-100 text-green-700']
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase', tone, className)}>{label}</span>
}

/** One row of the list: the organization's own template, or another organization's it runs with permission. */
type Row = {
  uuid: string
  title: string
  description: string
  thumbnail: string | null
  owned: boolean
  canEdit: boolean
  ownerName: string | null
  status: Pick<GoalTemplate, 'status' | 'published_version' | 'has_unpublished_changes'>
  system: boolean
  stageCount: number | null
  stepCount: number | null
  activeAssignments: number | null
  /** On another organization's template: which of its versions earn each badge here. */
  rules: string[]
  badges: TemplateBadgeRef[]
  frameworks: NonNullable<TemplateListItem['frameworks']>
  template?: TemplateListItem
}

function ownRow(template: TemplateListItem, canEdit: boolean): Row {
  return {
    uuid: template.template_uuid, title: template.title, description: template.description, thumbnail: template.thumbnail_image || null,
    owned: true, canEdit: canEdit && !template.read_only, ownerName: null, status: template, system: !!template.system_type,
    stageCount: template.stage_count ?? null, stepCount: template.step_count ?? null, activeAssignments: null, rules: [],
    badges: template.badges || [], frameworks: template.frameworks || [], template,
  }
}

/** Other organizations' templates this one runs: one row per template, with every badge it earns here. */
function routeRows(routes: IssuerBadgeRoute[]): Row[] {
  const rows = new Map<string, Row>()
  for (const route of routes) {
    const existing = rows.get(route.template.template_uuid)
    const active = route.assignments.filter((item) => item.status !== 'ended').length
    if (existing) {
      if (!existing.badges.some((badge) => badge.badge_uuid === route.badge.badge_uuid)) {
        existing.badges.push(route.badge)
        existing.rules.push(`${route.badge.name}: ${eligibilityLabel(route.rule, route.from_version)}`)
      }
      existing.activeAssignments = (existing.activeAssignments || 0) + active
      continue
    }
    rows.set(route.template.template_uuid, {
      uuid: route.template.template_uuid, title: route.template.title, description: route.template.description, thumbnail: route.template.thumbnail_image,
      owned: false, canEdit: false, ownerName: route.badge.owner_org?.name || null,
      status: { status: 'active', published_version: route.template.published_version, has_unpublished_changes: false }, system: false,
      stageCount: null, stepCount: null, activeAssignments: active, badges: [route.badge], frameworks: [],
      rules: [`${route.badge.name}: ${eligibilityLabel(route.rule, route.from_version)}`],
    })
  }
  return [...rows.values()]
}

/**
 * Plans › Templates: the organization's templates and the ones it runs with another organization's
 * permission, as rows with search and filters; Create (blank) and Add from marketplace for admins.
 */
export default function TemplateList({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const canEdit = useCanEditPlans() === true
  const [specsFrom, setSpecsFrom] = React.useState<Array<{ value: string; label: string }>>([])
  const specs = React.useMemo<FilterSpec[]>(() => [
    { key: 'source', label: 'Made by', options: [{ value: '', label: 'Anyone' }, { value: 'mine', label: 'Your org' }, { value: 'others', label: 'Other orgs' }] },
    { key: 'fw', label: 'Maps to', options: [{ value: '', label: 'Any framework' }, ...specsFrom] },
    { key: 'badge', label: 'Earns a badge', bool: true },
    { key: 'archived', label: 'Show archived', bool: true },
  ], [specsFrom])
  const filters = useFilters(specs)
  const showArchived = isOn(filters.values, 'archived')
  const key = orgId && token ? templateKeys.list(orgId, showArchived) : null
  const { data: templates, isLoading } = useSWR<TemplateListItem[]>(key, () => templatesApi.list(orgId, token, showArchived))
  const { data: routes = [] } = useSWR<IssuerBadgeRoute[]>(orgId && token ? templateKeys.badgeRoutes(orgId) : null, () => templatesApi.badgeRoutes(orgId, token))
  const [busy, setBusy] = React.useState<string | null>(null)

  const rows = React.useMemo(() => [...(templates || []).map((template) => ownRow(template, canEdit)), ...routeRows(routes)], [templates, routes, canEdit])
  const frameworkOptions = React.useMemo(() => {
    const seen = new Map<string, string>()
    rows.forEach((row) => row.frameworks.forEach((framework) => seen.set(framework.framework_uuid, framework.name)))
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])
  if (frameworkOptions.map((item) => item.value).join() !== specsFrom.map((item) => item.value).join()) setSpecsFrom(frameworkOptions)

  const { source, fw } = filters.values
  const shown = rows.filter((row) => (!source || (source === 'mine') === row.owned)
    && (!fw || row.frameworks.some((framework) => framework.framework_uuid === fw))
    && (!isOn(filters.values, 'badge') || row.badges.length > 0)
    && matchesSearch(filters.query, row.title, row.description, row.ownerName, ...row.badges.map((badge) => badge.name), ...row.frameworks.map((framework) => framework.name)))
  const hidden = rows.length - shown.length

  const toggleArchived = async (template: TemplateListItem) => {
    setBusy(template.template_uuid)
    try {
      if (template.status === 'archived') await templatesApi.unarchive(orgId, template.template_uuid, token)
      else await templatesApi.archive(orgId, template.template_uuid, token)
      await mutate(isTemplatesKey)
      toast.success(template.status === 'archived' ? 'Template restored.' : 'Template archived. Goals already handed out keep working.')
    } catch (error: any) { toast.error(error?.message || 'Could not change the template.') } finally { setBusy(null) }
  }

  return <div className="px-4 pb-10 pt-6 sm:px-10"><div className="mx-auto flex max-w-5xl flex-col gap-4">
    <FilterBar filters={filters} placeholder="Search templates"
      actions={<>{canEdit ? <NewTemplateModal orgslug={orgslug} orgId={orgId} token={token} /> : null}<AddFromMarketplace type="templates" /></>}
      summary={isLoading ? null : `${rows.length} template${rows.length === 1 ? '' : 's'} in your library${hidden ? ` · ${hidden} hidden by filters` : ''}`} />
    {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>
      : shown.length ? <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white" aria-label="Templates">
        {shown.map((row) => <TemplateRow key={row.uuid} row={row} orgslug={orgslug} busy={busy === row.uuid} onArchive={row.template && row.canEdit && !row.system ? () => void toggleArchived(row.template!) : undefined} />)}
      </ul>
        : rows.length ? <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-border px-4 py-16 text-center"><div>
          <Layers3 size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-muted-foreground">No templates match your search or filters.</p>
        </div></div>
        : <PageWelcome icon={<Layers3 size={28} />} title="Templates: plans you can hand out again and again"
          body="A template is a plan's stages and steps, written once. Hand it to one learner or a whole group, and each gets their own copy to work through."
          how="Start from a ready-made plan in the Marketplace and make it yours, or build one from scratch. Publish it when it's ready to hand out.">
          <AddFromMarketplace type="templates" />{canEdit ? <NewTemplateModal orgslug={orgslug} orgId={orgId} token={token} /> : null}
        </PageWelcome>}
  </div></div>
}

function TemplateRow({ row, orgslug, busy, onArchive }: { row: Row; orgslug: string; busy: boolean; onArchive?: () => void }) {
  const counts = [
    row.stageCount !== null ? `${row.stageCount} stage${row.stageCount === 1 ? '' : 's'}` : null,
    row.stepCount !== null ? `${row.stepCount} step${row.stepCount === 1 ? '' : 's'}` : null,
    row.activeAssignments !== null ? `${row.activeAssignments} active assignment${row.activeAssignments === 1 ? '' : 's'}` : null,
    row.system ? 'System' : null,
  ].filter(Boolean).join(' · ')
  return <li className={cn('group relative border-b border-gray-100 last:border-b-0', row.status.status === 'archived' && 'opacity-70')}>
    <Link href={templatePage(orgslug, row.uuid)} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50 sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-violet-100 text-violet-700">
        {row.thumbnail ? <SafeImage src={row.thumbnail} alt="" className="h-full w-full object-cover" /> : <Layers3 size={20} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words text-[15px] font-semibold text-gray-950">{row.title}</span><TemplateStatusChip template={row.status} /></span>
        {counts ? <span className="mt-0.5 block text-[13px] text-gray-500">{counts}</span> : null}
        {row.rules.length ? <span className="mt-0.5 block text-xs font-semibold text-gray-500">{row.rules.join(' · ')}</span> : null}
        <span className="mt-2 flex flex-wrap gap-1.5">
          <OwnershipChip owned={row.owned} canEdit={row.canEdit} ownerName={row.ownerName} />
          {row.badges.map((badge) => <span key={badge.badge_uuid} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><Award size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">{badge.name}</span></span>)}
          {row.frameworks.map((framework) => <span key={framework.framework_uuid} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700"><ListTree size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">{framework.name} · {framework.node_count}</span></span>)}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-gray-400" />
    </Link>
    {onArchive ? <button type="button" disabled={busy} onClick={onArchive} title={row.status.status === 'archived' ? 'Restore' : 'Archive'} aria-label={`${row.status.status === 'archived' ? 'Restore' : 'Archive'} ${row.title}`}
      className="absolute right-12 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100">
      {busy ? <Loader2 size={14} className="animate-spin" /> : row.status.status === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
    </button> : null}
  </li>
}

/** Create a blank template. (Copies from the library are added from Plans › Marketplace.) */
function NewTemplateModal({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const create = async () => {
    setSaving(true)
    try {
      const template = await templatesApi.create(orgId, { title: title.trim() }, token)
      await mutate(isTemplatesKey)
      setOpen(false)
      router.push(templatePage(orgslug, template.template_uuid))
    } catch (error: any) { toast.error(error?.message || 'Could not create the template.') } finally { setSaving(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Create template" dialogDescription="Start a blank template, then add its stages and steps."
    dialogTrigger={<button type="button" className={primaryActionClass}><Plus size={16} aria-hidden="true" />Create template</button>}
    dialogContent={<form className="space-y-3 p-2" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !saving) void create() }}>
      <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Template name" aria-label="Template name" />
      <Button type="submit" disabled={saving || !title.trim()} className="ml-auto flex">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create blank template</Button>
    </form>} />
}
