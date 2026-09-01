'use client'

import React from 'react'
import { ArrowLeft, Award, Check, ChevronDown, ChevronRight, FileText, Film, Image as ImageIcon, Link2, Loader2, Lock, Menu, MoreVertical, Pencil, Plus, SquareCheck, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { normalizeMediaUrl } from '@services/media/media'
import type { MediaType } from '@services/media/library'

export type PlanStepType = 'text' | 'media' | 'link' | 'checkbox' | 'badge'
export type PlanStepDefinition = {
  field_uuid: string
  title: string
  type: PlanStepType
  restricted: boolean
  access?: 'contributor' | 'reviewer'
  allowed_types?: Array<'image' | 'video' | 'document'>
  badge_uuid?: string
  badge_major_version?: number
  accept_previous_major_versions?: boolean
  badge?: any
  progress_percent?: number
}

type PlanTargetBase = {
  plan_uuid: string
  slug: string
  name: string
  status: string
  progress_percent: number
  due_date?: string | null
  review_count?: number
  attention_count?: number
  update_date?: string
}

export type IndividualPlanTarget = PlanTargetBase & {
  target_kind: 'individual'
  assignment_uuid?: never
  is_mine: boolean
  subject?: { id: number; name: string } | null
}

export type GroupPlanTarget = PlanTargetBase & {
  target_kind: 'group'
  assignment_uuid: string
  target_name: string
  group?: { id: number; name: string } | null
  learner_count: number
  min_progress_percent: number
  max_progress_percent: number
  is_mine: false
}

export type PlanTarget = IndividualPlanTarget | GroupPlanTarget

export function PlanWorkspaceHeader({ title, color, onClose, onOpenPanel }: { title: string; color: string; onClose(): void; onOpenPanel(): void }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { const frame = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(frame) }, [])
  return <div className="h-16 overflow-hidden rounded-2xl"><div className={cn('flex h-16 origin-left items-center overflow-hidden rounded-2xl px-5 text-white shadow-sm transition-[transform,opacity] duration-200 ease-out', open ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0')} style={{ backgroundColor: color }}><span className={cn('min-w-0 flex-1 truncate text-xl font-black tracking-tight transition-opacity delay-150 sm:text-2xl', open ? 'opacity-100' : 'opacity-0')}>{title}</span><button onClick={onOpenPanel} className="mr-2 flex h-8 items-center gap-1.5 rounded-full bg-black/15 px-3 text-[10px] font-black lg:hidden"><Menu size={14} />Details</button><button onClick={onClose} aria-label="Close plan editor and return to all plans" className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15 transition hover:bg-black/25"><X size={16} /></button></div></div>
}

type ObjectiveHeaderProgress = {
  total: number
  completed: number
  maxCompleted?: number
  minPercent?: number
  maxPercent?: number
  complete?: boolean
  locked?: boolean
}

export function PlanObjectiveHeader({ title, titleEditor, details, supplemental, open, editing = false, color, progress, actions, onToggle }: { title: string; titleEditor?: React.ReactNode; details?: React.ReactNode; supplemental?: React.ReactNode; open: boolean; editing?: boolean; color: string; progress?: ObjectiveHeaderProgress; actions?: React.ReactNode; onToggle(): void }) {
  return <div className="flex items-start gap-2 px-2 py-4 sm:gap-3 sm:px-4">
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">{editing && titleEditor ? titleEditor : <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-sm font-black">{title}</button>}</div>
      {details ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">{details}</div> : null}
      {supplemental}
    </div>
    {progress ? <PlanObjectiveProgressRing progress={progress} color={color} /> : null}
    <div className="flex self-stretch flex-col items-center justify-between">{actions || <span />}{!editing ? <button type="button" onClick={onToggle} aria-label={open ? 'Collapse objective' : 'Expand objective'} className="rounded p-1 text-muted-foreground"><ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} /></button> : <span />}</div>
  </div>
}

export function planTargetDateLabel(value?: string) {
  if (!value) return ''
  const target = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days > 0 && days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function PlanObjectiveProgressRing({ progress, color }: { progress: ObjectiveHeaderProgress; color: string }) {
  const total = Math.max(0, progress.total)
  const minimum = Math.max(0, Math.min(total, progress.completed))
  const maximum = Math.max(minimum, Math.min(total, progress.maxCompleted ?? minimum))
  const minPercent = progress.minPercent ?? (total ? Math.round((minimum / total) * 100) : 100)
  const maxPercent = progress.maxPercent ?? (total ? Math.round((maximum / total) * 100) : 100)
  const visibleMinimum = minPercent === 0 ? 4 : minPercent
  const ranged = maxPercent !== minPercent
  const countRanged = maximum !== minimum
  const background = ranged
    ? `conic-gradient(${color} 0 ${visibleMinimum}%, color-mix(in srgb, ${color} 50%, transparent) ${visibleMinimum}% ${maxPercent}%, hsl(var(--muted)) ${maxPercent}% 100%)`
    : `conic-gradient(${color} ${visibleMinimum}%, hsl(var(--muted)) 0)`
  const label = countRanged ? `${minimum}–${maximum}/${total}` : `${minimum}/${total}`
  return <span className="flex shrink-0 flex-col items-center gap-0.5"><span role="progressbar" aria-label={countRanged ? `Group progress ranges from ${minimum} to ${maximum} of ${total} steps` : `${minimum} of ${total} steps complete`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={minimum} className="relative h-7 w-7 rounded-full" style={{ background }}><span className="absolute inset-[3px] flex items-center justify-center rounded-full bg-card">{progress.complete ? <Check size={10} className="text-emerald-700" strokeWidth={3} /> : progress.locked && minPercent === 100 ? <Lock size={9} className="text-muted-foreground" /> : null}</span></span><span className="text-[8px] font-black tabular-nums leading-none text-muted-foreground">{label}</span></span>
}

export const PLAN_PERMISSION_GROUPS = [
  { label: 'Access & communication', items: ['view_plan', 'comment'] },
  { label: 'Objectives & evidence', items: ['update_progress', 'contribute_fields', 'contribute_restricted_fields', 'complete_restricted_objectives', 'review_badge_submissions'] },
  { label: 'Plan editing', items: ['edit_plan_details', 'edit_structure', 'edit_schedule', 'complete_plan', 'archive_plan'] },
  { label: 'People & roles', items: ['request_collaborators', 'manage_collaborators', 'manage_roles'] },
]

export function normalizePlanSteps(fields: any[] = []): PlanStepDefinition[] {
  return fields.map((field) => ({
    ...field,
    field_uuid: String(field.field_uuid || field.key || `field_${crypto.randomUUID()}`),
    title: String(field.title || ''),
    type: (field.type || 'text') as PlanStepType,
    restricted: Boolean(field.restricted ?? ['reviewer', 'staff'].includes(String(field.access || field.lane || 'contributor'))),
    access: (field.restricted ?? ['reviewer', 'staff'].includes(String(field.access || field.lane || 'contributor'))) ? 'reviewer' : 'contributor',
    allowed_types: (field.allowed_types || []).map((value: string) => value === 'pdf' ? 'document' : value),
  }))
}

export function StepTypeIcon({ type, size = 15 }: { type?: string; size?: number }) {
  if (type === 'badge') return <Award size={size} />
  if (type === 'media') return <Upload size={size} />
  if (type === 'image') return <ImageIcon size={size} />
  if (type === 'video') return <Film size={size} />
  if (type === 'link') return <Link2 size={size} />
  if (type === 'checkbox') return <SquareCheck size={size} />
  return <FileText size={size} />
}

// eslint-disable-next-line no-unused-vars
export function PlanStepPicker({ badges, onAdd, trigger }: { badges: any[]; onAdd: (type: string, options?: any) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<'root' | 'badge' | 'media'>('root')
  const [query, setQuery] = React.useState('')
  const [mediaTypes, setMediaTypes] = React.useState<MediaType[]>(['image', 'document'])
  React.useEffect(() => { if (!open) { setView('root'); setQuery(''); setMediaTypes(['image', 'document']) } }, [open])
  const filtered = badges.filter((badge: any) => String(badge.name || '').toLowerCase().includes(query.trim().toLowerCase()))
  const choose = (type: string, options?: any) => { onAdd(type, options); setOpen(false) }
  const toggleMedia = (type: MediaType) => setMediaTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild>{trigger || <button type="button" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[10px] font-black text-muted-foreground hover:bg-muted"><Plus size={13} />New step</button>}</DropdownMenuTrigger><DropdownMenuContent align="start" className="w-auto min-w-52 max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-1">
    {view === 'root' ? <div><DropdownMenuItem onClick={() => choose('text')}><FileText size={14} className="mr-2" />Note</DropdownMenuItem><DropdownMenuItem onSelect={(event) => { event.preventDefault(); setView('media') }}><Upload size={14} className="mr-2" /><span className="flex-1">Media</span><ChevronRight size={13} /></DropdownMenuItem><DropdownMenuItem onClick={() => choose('link')}><Link2 size={14} className="mr-2" />Links</DropdownMenuItem><DropdownMenuItem onClick={() => choose('checkbox')}><SquareCheck size={14} className="mr-2" />Checkbox</DropdownMenuItem><DropdownMenuItem onSelect={(event) => { event.preventDefault(); setView('badge') }}><Award size={14} className="mr-2" /><span className="flex-1">Badge</span><ChevronRight size={13} /></DropdownMenuItem></div> : null}
    {view === 'badge' ? <div className="w-64"><div className="flex items-center gap-1 border-b border-border p-1"><button type="button" onClick={() => setView('root')} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft size={14} /></button><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a badge…" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" /></div><div className="max-h-64 overflow-y-auto pt-1">{filtered.map((badge: any) => <DropdownMenuItem key={badge.badge_uuid} onClick={() => choose('badge', badge)}><span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{badge.thumbnail_image ? <img src={normalizeMediaUrl(badge.thumbnail_image)} alt="" className="h-full w-full object-cover" /> : <Award size={13} />}</span><span className="truncate">{badge.name}</span></DropdownMenuItem>)}{!filtered.length ? <p className="p-3 text-center text-[10px] text-muted-foreground">No badges found.</p> : null}</div></div> : null}
    {view === 'media' ? <div className="w-60"><div className="flex items-center gap-2 border-b border-border px-1 pb-2"><button type="button" onClick={() => setView('root')} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft size={14} /></button><span className="text-xs font-black">Acceptable media</span></div><div className="space-y-1 py-2">{([['image', 'Images', <ImageIcon key="image" size={14} />], ['video', 'Video', <Film key="video" size={14} />], ['document', 'Documents (PDF)', <FileText key="document" size={14} />]] as const).map(([type, label, icon]) => <button key={type} type="button" onClick={() => toggleMedia(type)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted">{icon}<span className="flex-1">{label}</span><span className={cn('flex h-4 w-4 items-center justify-center rounded border', mediaTypes.includes(type) && 'bg-foreground text-background')}>{mediaTypes.includes(type) ? <Check size={11} /> : null}</span></button>)}</div><button type="button" disabled={!mediaTypes.length} onClick={() => choose('media', { allowed_types: mediaTypes })} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[10px] font-black text-background disabled:opacity-40"><Check size={12} />Confirm</button></div> : null}
  </DropdownMenuContent></DropdownMenu>
}

// eslint-disable-next-line no-unused-vars
export function PlanPermissionChecklist({ capabilities, setCapabilities, available, disabled = false }: { capabilities: string[]; setCapabilities(value: string[]): void; available: string[]; disabled?: boolean }) {
  const known = new Set(PLAN_PERMISSION_GROUPS.flatMap((group) => group.items))
  const groups = [...PLAN_PERMISSION_GROUPS, { label: 'Other', items: available.filter((item) => !known.has(item)) }]
  return <div className="space-y-5">{groups.map((group) => {
    const items = group.items.filter((item) => available.includes(item))
    if (!items.length) return null
    return <fieldset key={group.label}><legend className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</legend><div className="grid gap-2 sm:grid-cols-2">{items.map((capability) => <label key={capability} className={cn('flex items-start gap-2 rounded-lg border border-border p-3 text-xs font-bold', disabled ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'cursor-pointer hover:border-blue-300')}><input type="checkbox" checked={capabilities.includes(capability)} disabled={disabled} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, capability] : capabilities.filter((item) => item !== capability))} className="mt-0.5" /><span>{capability.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())}</span></label>)}</div></fieldset>
  })}</div>
}

type CardProps = {
  objective: any
  mode: 'template' | 'individual-live' | 'group-live'
  canEdit?: boolean
  canSchedule?: boolean
  badges?: any[]
  saving?: boolean
  color?: string
  // eslint-disable-next-line no-unused-vars
  onSave?(data: any): Promise<void> | void
  onDelete?: () => Promise<void> | void
  children?: React.ReactNode
}

export function PlanObjectiveDefinitionCardLegacy({ objective, mode, canEdit = true, badges = [], saving = false, color = '#2563eb', onSave, onDelete, children }: CardProps) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<any>({ ...objective, fields: normalizePlanSteps(objective.fields || objective.custom_fields || []) })
  React.useEffect(() => setDraft({ ...objective, fields: normalizePlanSteps(objective.fields || objective.custom_fields || []) }), [objective])
  const updateStep = (index: number, patch: any) => setDraft({ ...draft, fields: draft.fields.map((field: any, fieldIndex: number) => fieldIndex === index ? { ...field, ...patch } : field) })
  const addStep = () => setDraft({ ...draft, fields: [...draft.fields, { field_uuid: `field_${crypto.randomUUID()}`, title: '', type: 'text', restricted: false, access: 'contributor', allowed_types: [] }] })
  const save = async () => {
    await onSave?.({ ...draft, custom_fields: draft.fields, fields: draft.fields })
    setEditing(false)
  }
  const complete = objective.progress?.status === 'completed'
  const completedSteps = (objective.fields || []).filter((field: any) => field.type === 'badge' ? Number(field.progress_percent || 0) >= 100 : Boolean(objective.progress?.field_values?.[field.field_uuid])).length
  const groupRange = objective.aggregate ? { min: Number(objective.aggregate.min_progress_percent || 0), max: Number(objective.aggregate.max_progress_percent || 0) } : null
  return <article className={cn('rounded-xl border border-border bg-card transition', open && 'shadow-lg ring-1 ring-black/5', complete && !open && 'bg-emerald-50/50')}>
    <div className="flex items-start gap-3 p-4"><button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-black">{objective.title}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground">{mode === 'template' ? <>{draft.fields.length} step{draft.fields.length === 1 ? '' : 's'}{objective.default_allow_late ? ' · late completion allowed' : ''}</> : mode === 'group-live' ? <>{objective.effective_due_date ? String(objective.effective_due_date).slice(0, 10) : null}</> : <>{complete ? 'Completed' : `${completedSteps}/${(objective.fields || []).length} steps`}{objective.effective_due_date ? ` · ${String(objective.effective_due_date).slice(0, 10)}` : ''}</>}{objective.completion_restricted || !objective.allow_learner_confirmation ? <span className="inline-flex items-center gap-1"><Lock size={9} />Restricted completion</span> : null}</span></button>{mode === 'group-live' && groupRange ? <GroupProgressRing min={groupRange.min} max={groupRange.max} color={color} /> : null}{canEdit ? editing ? <button type="button" onClick={() => void save()} disabled={saving || !draft.title?.trim()} aria-label="Save objective" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button> : <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Objective options" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><MoreVertical size={16} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setOpen(true); setEditing(true) }}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>{onDelete ? <DropdownMenuItem onClick={() => void onDelete()} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu> : null}{!editing ? <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse objective' : 'Expand objective'} className="rounded p-2 text-muted-foreground"><ChevronDown size={15} className={cn('transition', open && 'rotate-180')} /></button> : null}</div>
    {open ? <div className="border-t border-border/60 px-4 pb-5 pt-4">{editing ? <div className="space-y-4"><input value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="w-full border-b border-dashed border-foreground/35 bg-transparent text-sm font-black outline-none" /><textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add a description" className="min-h-16 w-full resize-y border-b border-dashed border-foreground/35 bg-transparent text-xs leading-5 text-muted-foreground outline-none" /><div className="grid grid-cols-2 gap-3">{draft.fields.map((field: PlanStepDefinition, index: number) => <div key={field.field_uuid}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><select aria-label="Step type" value={field.type} onChange={(event) => updateStep(index, { type: event.target.value, ...(event.target.value === 'media' ? { allowed_types: ['image', 'document'] } : {}) })} className="h-8 w-20 rounded-lg border border-border bg-card px-1 text-[10px]"><option value="text">Note</option><option value="media">Media</option><option value="link">Links</option><option value="checkbox">Check</option><option value="badge">Badge</option></select><input value={field.title} onChange={(event) => updateStep(index, { title: event.target.value })} placeholder="Step name" className="min-w-0 flex-1 border-b border-dashed border-foreground/35 bg-transparent text-[11px] font-black outline-none" /><button type="button" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, itemIndex: number) => itemIndex !== index) })} aria-label={`Remove ${field.title || 'step'}`} className="rounded p-1 text-muted-foreground hover:text-red-600"><Trash2 size={12} /></button></div>{field.type === 'badge' ? <select value={field.badge_uuid || ''} onChange={(event) => { const badge = badges.find((item) => item.badge_uuid === event.target.value); updateStep(index, { badge_uuid: event.target.value, title: field.title || badge?.name || '' }) }} className="mt-2 h-8 w-full rounded-lg border border-border bg-card px-2 text-[10px]"><option value="">Choose badge…</option>{badges.map((badge) => <option key={badge.badge_uuid} value={badge.badge_uuid}>{badge.name}</option>)}</select> : null}<label className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold text-muted-foreground"><input type="checkbox" checked={field.restricted} onChange={(event) => updateStep(index, { restricted: event.target.checked, access: event.target.checked ? 'reviewer' : 'contributor' })} />Restricted</label></div>)}<button type="button" onClick={addStep} disabled={complete} className="flex h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[10px] font-black text-muted-foreground disabled:opacity-40"><Plus size={12} />New step</button></div><label className="inline-flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(draft.completion_restricted ?? !draft.allow_learner_confirmation)} onChange={(event) => setDraft({ ...draft, completion_restricted: event.target.checked, allow_learner_confirmation: !event.target.checked })} />Restricted completion</label></div> : <><p className="text-xs leading-5 text-muted-foreground">{objective.description || 'No description yet.'}</p><div className="mt-4 grid grid-cols-2 gap-3">{normalizePlanSteps(objective.fields || objective.custom_fields || []).map((field) => { const range = objective.aggregate?.steps?.[field.field_uuid]; const background = mode === 'group-live' && range ? threeToneBackground(color, range.min_progress_percent, range.max_progress_percent) : undefined; return <div key={field.field_uuid} className="flex min-h-12 items-center gap-2 overflow-hidden rounded-xl bg-muted px-3" style={{ background }}><StepTypeIcon type={field.type} /><span className="min-w-0 flex-1 truncate text-[11px] font-black">{field.title}</span>{field.restricted ? <Lock size={11} /> : null}</div> })}</div>{children}</>}</div> : null}
  </article>
}

export function PlanObjectiveDefinitionCard({ objective, mode, canEdit = true, badges = [], saving = false, color = '#2563eb', onSave, onDelete, children }: CardProps) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const normalized = () => normalizePlanSteps(objective.fields || objective.custom_fields || [])
  const [draft, setDraft] = React.useState<any>({ ...objective, fields: normalized() })
  React.useEffect(() => setDraft({ ...objective, fields: normalizePlanSteps(objective.fields || objective.custom_fields || []) }), [objective])
  const stepDefinition = (type: string, options?: any) => ({ field_uuid: `field_${crypto.randomUUID()}`, title: options?.name || '', type, restricted: false, access: 'contributor', allowed_types: type === 'media' ? options?.allowed_types || ['image', 'document'] : [], ...(type === 'badge' && options ? { badge_uuid: options.badge_uuid, badge: { badge_uuid: options.badge_uuid, name: options.name, thumbnail_image: options.thumbnail_image } } : {}) })
  const changeStep = (index: number, type: string, options?: any) => setDraft((current: any) => ({ ...current, fields: current.fields.map((field: any, fieldIndex: number) => fieldIndex === index ? { ...stepDefinition(type, options), field_uuid: field.field_uuid, title: type === 'badge' ? options?.name || field.title : field.title } : field) }))
  const save = async () => { await onSave?.({ ...draft, fields: draft.fields, custom_fields: draft.fields }); setEditing(false) }
  const groupRange = objective.aggregate ? { min: Number(objective.aggregate.min_progress_percent || 0), max: Number(objective.aggregate.max_progress_percent || 0) } : null
  const steps = normalized()
  const individualCompletedSteps = steps.filter((field) => field.type === 'badge' ? Number(field.progress_percent || 0) >= 100 : Boolean(objective.progress?.field_values?.[field.field_uuid])).length
  const targetLabel = objective.target_label || (objective.effective_due_date ? `${planTargetDateLabel(objective.effective_due_date)}${objective.has_fixed_due_date === false ? ' · phase' : ''}` : '')
  return <article className={cn('bg-card transition-[box-shadow,border-radius,background-color]', open && 'relative z-10 my-2 rounded-2xl shadow-lg ring-1 ring-black/5')}>
    <PlanObjectiveHeader
      title={objective.title}
      titleEditor={<input autoFocus value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="min-w-0 flex-1 border-b border-dashed border-foreground/35 bg-transparent text-sm font-black outline-none" />}
      details={<>{objective.phase_name ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black">{objective.phase_name}</span> : mode === 'template' ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black">{steps.length} step{steps.length === 1 ? '' : 's'}</span> : null}{targetLabel ? <span>{targetLabel}</span> : null}{objective.completion_restricted || !objective.allow_learner_confirmation ? <span className="inline-flex items-center gap-1"><Lock size={9} />Restricted completion</span> : null}</>}
      open={open}
      editing={editing}
      color={color}
      progress={mode === 'group-live' && groupRange ? { total: steps.length, completed: Number(objective.aggregate?.min_completed_steps ?? Math.round(groupRange.min * steps.length / 100)), maxCompleted: Number(objective.aggregate?.max_completed_steps ?? Math.round(groupRange.max * steps.length / 100)), minPercent: groupRange.min, maxPercent: groupRange.max } : mode === 'individual-live' ? { total: steps.length, completed: individualCompletedSteps, complete: objective.progress?.status === 'completed' } : undefined}
      actions={canEdit ? editing ? <button type="button" onClick={() => void save()} disabled={saving || !draft.title?.trim()} aria-label="Save objective" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button> : <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Objective options" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><MoreVertical size={16} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setOpen(true); setEditing(true) }}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>{onDelete ? <DropdownMenuItem onClick={() => void onDelete()} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu> : null}
      onToggle={() => setOpen(!open)}
    />
    {open ? <div className="px-3 pb-5 sm:px-4"><div className="border-t border-border/60 pt-4">{editing ? <textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add a description" className="min-h-16 w-full resize-y border-b border-dashed border-foreground/35 bg-transparent text-xs leading-5 text-muted-foreground outline-none" /> : <p className="text-xs leading-5 text-muted-foreground">{objective.description || 'No description yet.'}</p>}</div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">{(editing ? draft.fields : steps).map((field: PlanStepDefinition, index: number) => {
        if (editing) return <div key={field.field_uuid}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><PlanStepPicker badges={badges} onAdd={(type, options) => changeStep(index, type, options)} trigger={<button type="button" aria-label="Change step type" className="flex h-8 w-11 shrink-0 items-center justify-between rounded-lg border border-border bg-card px-2 text-muted-foreground"><StepTypeIcon type={field.type} size={14} /><ChevronDown size={10} /></button>} /><input value={field.title || ''} onChange={(event) => setDraft((current: any) => ({ ...current, fields: current.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate) }))} placeholder="Step name" className="min-w-0 flex-1 border-b border-dashed border-foreground/35 bg-transparent text-[11px] font-black outline-none" /><button type="button" onClick={() => setDraft((current: any) => ({ ...current, fields: current.fields.filter((_: any, candidateIndex: number) => candidateIndex !== index) }))} aria-label={`Remove ${field.title || 'step'}`} className="rounded p-1 text-muted-foreground hover:text-red-600"><X size={12} /></button></div><button type="button" onClick={() => setDraft((current: any) => ({ ...current, fields: current.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, restricted: !candidate.restricted, access: !candidate.restricted ? 'reviewer' : 'contributor' } : candidate) }))} className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{field.restricted ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Restricted</button></div>
        const range = objective.aggregate?.steps?.[field.field_uuid]
        return <button type="button" disabled={mode === 'group-live'} key={field.field_uuid} className="flex min-h-12 items-center gap-2 overflow-hidden rounded-xl bg-muted px-3 text-left disabled:opacity-100" style={{ background: mode === 'group-live' && range ? threeToneBackground(color, range.min_progress_percent, range.max_progress_percent) : undefined }}><StepTypeIcon type={field.type} /><span className="min-w-0 flex-1 truncate text-[11px] font-black">{field.title}</span>{field.restricted ? <Lock size={11} /> : null}</button>
      })}{editing ? <PlanStepPicker badges={badges} onAdd={(type, options) => setDraft((current: any) => ({ ...current, fields: [...current.fields, stepDefinition(type, options)] }))} /> : null}</div>
      {!editing ? children : null}
      {editing ? <label className="mt-4 inline-flex items-center gap-2 text-[9px] font-bold text-muted-foreground"><input type="checkbox" checked={Boolean(draft.completion_restricted ?? !draft.allow_learner_confirmation)} onChange={(event) => setDraft({ ...draft, completion_restricted: event.target.checked, allow_learner_confirmation: !event.target.checked })} />Restricted completion</label> : null}
    </div> : null}
  </article>
}

function threeToneBackground(color: string, min: number, max: number) {
  const floor = Math.max(0, Math.min(100, Number(min || 0)))
  const ceiling = Math.max(floor, Math.min(100, Number(max || 0)))
  return `linear-gradient(to right, color-mix(in srgb, ${color} 68%, transparent) 0 ${floor}%, color-mix(in srgb, ${color} 34%, transparent) ${floor}% ${ceiling}%, color-mix(in srgb, ${color} 10%, transparent) ${ceiling}% 100%)`
}

function GroupProgressRing({ min, max, color }: { min: number; max: number; color: string }) {
  return <span role="progressbar" aria-label={`Group progress ranges from ${min} to ${max} percent`} aria-valuemin={0} aria-valuemax={100} className="relative mt-0.5 h-8 w-8 shrink-0 rounded-full" style={{ background: `conic-gradient(${color} 0 ${min}%, color-mix(in srgb, ${color} 50%, transparent) ${min}% ${max}%, color-mix(in srgb, ${color} 14%, transparent) ${max}% 100%)` }}><span className="absolute inset-[4px] rounded-full bg-card" /></span>
}
