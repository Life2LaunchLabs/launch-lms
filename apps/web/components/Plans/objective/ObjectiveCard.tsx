'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Award, CalendarDays, Check, ChevronDown, ChevronRight, FileText, Film, Image as ImageIcon, Link2, Loader2, Lock, MoreVertical, Pencil, Plus, RotateCcw, SquareCheck, Trash2, Upload, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { planningApi } from '@services/planning/planning'
import { getLearningBadges } from '@services/learning/learning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { normalizeMediaUrl } from '@services/media/media'
import { cn } from '@/lib/utils'
import { PersonAvatar, PlanObjectiveHeader, PlanStepPicker } from '../PlanEditorShared'
import { dateValue, inlineEditableClass, targetDateLabel } from '../planDates'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { DiscussionEditor } from '@components/Objects/Communities/DiscussionEditor'
import type { MediaAsset, MediaType } from '@services/media/library'

const detailKey = (slug?: string) => slug ? `${getAPIUrl()}planning/plans/${encodeURIComponent(slug)}` : null

export function fieldKey(field: any) { return String(field.field_uuid || field.key || '') }
export function hasFieldValue(value: any) { return typeof value === 'boolean' ? value : Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '' }

function fieldIsRestricted(field: any) {
  const lane = String(field.access || field.lane || 'contributor')
  return field.restricted ?? ['reviewer', 'staff'].includes(lane)
}

function AccessPeopleLine({ item, capability, unlocked }: { item: any; capability: string; unlocked: boolean }) {
  const [open, setOpen] = React.useState(false)
  const accessPeople = item.access_people || []
  const isEligible = (person: any) => person?.capabilities?.includes(capability) && (!capability.startsWith('contribute_') || person?.capabilities?.includes('update_progress'))
  const people = accessPeople.filter(isEligible)
  const subject = accessPeople.find((person: any) => person.is_subject)
  const roles = Array.from(new Set(people.map((person: any) => person.role?.name).filter(Boolean)))
  if (!accessPeople.some((person: any) => !person.is_subject)) return null
  if (unlocked) return <p className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground">{isEligible(subject) ? <Check size={10} /> : <Lock size={10} />}{isEligible(subject) ? `${item.subject?.name?.split(' ')[0] || 'The subject'} can do this too` : `${item.subject?.name?.split(' ')[0] || 'The subject'} needs help with this`}</p>
  return <div className="relative mt-1.5"><button type="button" onClick={() => setOpen(!open)} className="flex max-w-full items-center gap-2 text-left"><span className="flex -space-x-1.5">{people.slice(0, 3).map((person: any) => <span key={person.user?.id} className="rounded-full ring-2 ring-card"><PersonAvatar user={person.user} size="xs" /></span>)}{people.length > 3 ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-black ring-2 ring-card">+{people.length - 3}</span> : null}</span><span className="truncate text-[9px] font-bold text-muted-foreground">{roles.length ? roles.join(', ') : 'No one assigned'} <ChevronDown size={9} className="inline" /></span></button>{open ? <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-xl border border-border bg-popover p-2 shadow-xl">{people.map((person: any) => <div key={person.user?.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"><PersonAvatar user={person.user} /><span className="min-w-0"><span className="block truncate text-[10px] font-black">{person.user?.name}</span><span className="block text-[9px] text-muted-foreground">{person.role?.name}</span></span></div>)}{!people.length ? <p className="p-2 text-[10px] text-muted-foreground">No eligible collaborator assigned.</p> : null}</div> : null}</div>
}

function RequirementTypeIcon({ type, size = 15 }: { type?: string; size?: number }) {
  if (type === 'media') return <Upload size={size} />
  if (type === 'image') return <ImageIcon size={size} />
  if (type === 'link') return <Link2 size={size} />
  if (type === 'checkbox') return <SquareCheck size={size} />
  return <FileText size={size} />
}

// eslint-disable-next-line no-unused-vars
function StepPicker({ badges, onAdd, trigger }: { badges: any[]; onAdd: (type: string, options?: any) => void; trigger?: React.ReactNode }) {
  return <PlanStepPicker badges={badges} onAdd={onAdd} trigger={trigger} />
}

/** A step's full card: what it asks for, the inputs that complete it, review, and its definition when editing. */
export default function ObjectiveCard({ item, orgslug, token, viewerUserId, refresh, color, editorMode = false, detail, expanded, onExpandedChange, startEditing = false, onStartedEditing }: any) {
  const cardRef = React.useRef<HTMLElement>(null)
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = expanded ?? internalOpen
  const setOpen = React.useCallback((value: boolean) => { setInternalOpen(value); onExpandedChange?.(value) }, [onExpandedChange])
  const [descriptionOpen, setDescriptionOpen] = React.useState(false)
  const [activeField, setActiveField] = React.useState('')
  const [noteField, setNoteField] = React.useState<any>(null)
  const [noteDraft, setNoteDraft] = React.useState<any>('')
  const [linksField, setLinksField] = React.useState<any>(null)
  const [linkDrafts, setLinkDrafts] = React.useState<string[]>([''])
  const [mediaField, setMediaField] = React.useState<any>(null)
  const [mediaType, setMediaType] = React.useState<MediaType | null>(null)
  const [checkboxField, setCheckboxField] = React.useState<any>(null)
  const [checkboxDraft, setCheckboxDraft] = React.useState(false)
  const [fieldValues, setFieldValues] = React.useState<Record<string, any>>(item.progress?.field_values || {})
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<any>(item)
  const [saving, setSaving] = React.useState(false)
  const { data: fetchedDetail } = useSWR<any>(editing && !detail && token ? detailKey(item.plan?.slug) : null, (url: string) => swrFetcher(url, token))
  const { data: badgeChoices = [] } = useSWR<any[]>(editing && token ? ['plan-requirement-badges', token] : null, async ([, accessToken]: [string, string]) => { const response = await getLearningBadges(undefined, accessToken); return Array.isArray(response) ? response : response?.data || [] })
  const fullDetail = detail || fetchedDetail
  React.useEffect(() => { setFieldValues(item.progress?.field_values || {}); setDraft({ ...item, phase_uuid: item.phase_uuid || '', phase_name: item.phase_name || '', due_date: dateValue(item.due_date) }) }, [item])
  React.useEffect(() => { if (startEditing) { setOpen(true); setEditing(true); onStartedEditing?.() } }, [startEditing, onStartedEditing, setOpen])
  React.useEffect(() => {
    if (!open || editing) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (cardRef.current?.contains(target) || target?.closest(`[data-objective-shell="${item.objective_uuid}"]`) || target?.closest('[role="menu"], [role="dialog"], .hub-panel, .hub-edge')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, editing, item.objective_uuid, setOpen])
  const status = item.progress?.status
  const supportingLocked = status === 'completed'
  const fields = item.fields || []
  const completeFields = fields.filter((field: any) => field.type === 'badge' ? Number(field.progress_percent || 0) >= 100 : hasFieldValue(fieldValues[fieldKey(field)])).length
  const stepPercent = fields.length ? Math.round((completeFields / fields.length) * 100) : 100
  const visibleStepPercent = stepPercent === 0 ? 3 : stepPercent
  const stepsReady = completeFields === fields.length
  const canMarkComplete = !item.blocked && (item.can_review && status === 'submitted' || item.can_update && item.can_complete)
  const canCompleteNow = status !== 'completed' && stepsReady && canMarkComplete
  const canReopen = status === 'completed' && item.can_update
  const completionCapability = item.completion_restricted ? 'complete_restricted_objectives' : 'update_progress'
  const completionBackground = status === 'completed' ? 'linear-gradient(to right, rgb(16 185 129 / 0.22) 0 100%)' : canCompleteNow ? color : `linear-gradient(to right, color-mix(in srgb, ${color} 32%, transparent) 0 ${visibleStepPercent}%, color-mix(in srgb, ${color} 9%, transparent) ${visibleStepPercent}% 100%)`
  const saveProgress = async (statusOverride?: string, values = fieldValues) => {
    const nextStatus = statusOverride || (status === 'completed' ? 'in_progress' : 'completed')
    setSaving(true)
    try { await planningApi.updateProgress(item.plan.slug, item.objective_uuid, { status: nextStatus, ...(Object.keys(values).length ? { field_values: values } : {}) }, token); await refresh(); toast.success(nextStatus === 'completed' ? 'Objective completed.' : 'Progress saved.') } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const saveDefinition = async () => {
    setSaving(true)
    const fieldsToSave = (draft.fields || []).map((field: any) => Object.fromEntries(Object.entries(field).filter(([key]) => !['badge', 'badge_href', 'progress_percent'].includes(key))))
    try { await planningApi.updateObjective(item.plan.slug, item.objective_uuid, { title: draft.title, description: draft.description || '', ...(!supportingLocked ? { fields: fieldsToSave } : {}), blocked: Boolean(draft.blocked), completion_restricted: Boolean(draft.completion_restricted), ...(item.can_schedule ? { phase_uuid: draft.phase_uuid || null, due_date: draft.due_date || null, allow_late: Boolean(draft.allow_late) } : {}) }, token); await refresh(); setEditing(false); toast.success('Objective updated.') } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const cancelDefinition = () => {
    setDraft({ ...item, phase_uuid: item.phase_uuid || '', phase_name: item.phase_name || '', due_date: dateValue(item.due_date) })
    setEditing(false)
  }
  const removeObjective = async () => {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    try { await planningApi.removeObjective(item.plan.slug, item.objective_uuid, token); setOpen(false); await refresh(); toast.success('Objective deleted.') } catch (error: any) { toast.error(error?.message || 'Could not delete objective.') }
  }
  const stepDefinition = (type: string, options?: any) => ({ field_uuid: `field_${crypto.randomUUID()}`, title: options?.name || '', type, access: 'contributor', restricted: false, ...(type === 'badge' && options ? { badge_uuid: options.badge_uuid, badge: { badge_uuid: options.badge_uuid, name: options.name, thumbnail_image: options.thumbnail_image }, progress_percent: 0 } : {}), ...(type === 'media' ? { allowed_types: options?.allowed_types || ['image', 'document'] } : {}) })
  const addRequirement = (type: string, options?: any) => setDraft({ ...draft, fields: [...(draft.fields || []), stepDefinition(type, options)] })
  const changeStepType = (index: number, type: string, options?: any) => setDraft({ ...draft, fields: draft.fields.map((field: any, fieldIndex: number) => fieldIndex === index ? { ...stepDefinition(type, options), field_uuid: field.field_uuid, title: type === 'badge' ? options?.name || field.title : field.title } : field) })
  const saveStepValues = (values: Record<string, any>) => saveProgress('in_progress', { ...fieldValues, ...values })
  const openStep = (field: any) => {
    const key = fieldKey(field)
    if (field.type === 'checkbox') { setCheckboxField(field); setCheckboxDraft(Boolean(fieldValues[key])); return }
    if (field.type === 'text') { setNoteField(field); setNoteDraft(fieldValues[key] || ''); return }
    if (field.type === 'link') { const values = Array.isArray(fieldValues[key]) ? fieldValues[key] : []; setLinksField(field); setLinkDrafts(values.length ? values.map((value: string) => value.replace(/^https:\/\/www\./, '')) : ['']); return }
    if (field.type === 'media') { setMediaField(field); const allowed = field.allowed_types || ['image', 'document']; if (allowed.length === 1) setMediaType(allowed[0]); return }
    setActiveField(activeField === key ? '' : key)
  }
  const linkValues = linkDrafts.map((value) => `https://www.${value.trim()}`)
  const linksValid = linkDrafts.length > 0 && linkDrafts.every((value) => { try { const parsed = new URL(`https://www.${value.trim()}`); return Boolean(value.trim() && parsed.hostname.startsWith('www.') && parsed.hostname.length > 4) } catch { return false } })
  const saveNote = async () => { if (!noteField) return; await saveStepValues({ [fieldKey(noteField)]: noteDraft }); setNoteField(null) }
  const saveLinks = async () => { if (!linksField || !linksValid) return; await saveStepValues({ [fieldKey(linksField)]: linkValues }); setLinksField(null) }
  const saveMedia = async (asset: MediaAsset) => { if (!mediaField) return; const key = fieldKey(mediaField); const current = Array.isArray(fieldValues[key]) ? fieldValues[key] : []; await saveStepValues({ [key]: [...current, asset] }); setMediaType(null); setMediaField(null) }
  const helping = !item.is_mine && item.subject && !editorMode
  return <article ref={cardRef} className={cn('group bg-card transition-[box-shadow,border-radius,transform,background-color] duration-150', !editorMode && !open && 'hover:bg-muted/20', !open && status === 'completed' && 'bg-emerald-50/50 dark:bg-emerald-950/15', !open && canCompleteNow && 'bg-emerald-50/30 dark:bg-emerald-950/10', open && 'relative z-10 my-2 rounded-2xl shadow-lg ring-1 ring-black/5')}>
    <PlanObjectiveHeader
      title={item.title}
      titleEditor={<input autoFocus value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-sm font-black')} />}
      details={<>{!editorMode ? <Link href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(item.plan.slug)}`)} onClick={(event) => event.stopPropagation()} className="inline-flex max-w-48 truncate rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: color }}>{item.plan.name}</Link> : null}{editing && fullDetail ? <label className="relative inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-[10px] font-black"><span className="max-w-32 truncate">{fullDetail.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.name || 'Choose phase'}</span><ChevronDown size={10} /><select aria-label="Move objective to phase" value={draft.phase_uuid || ''} onChange={(event) => setDraft({ ...draft, phase_uuid: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0"><option value="" disabled>Move to phase…</option>{fullDetail.phases?.map((candidate: any) => <option key={candidate.phase_uuid} value={candidate.phase_uuid}>{candidate.name}{candidate.phase_uuid === item.phase_uuid ? ' (current)' : ''}</option>)}</select></label> : item.phase_name ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black">{item.phase_name}</span> : null}{editing && item.can_schedule ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2 pr-1 text-[10px] font-black"><CalendarDays size={10} /><input type="date" aria-label="Objective target date" value={draft.due_date || ''} min={fullDetail?.start_date ? dateValue(fullDetail.start_date) : undefined} max={fullDetail?.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.due_date || fullDetail?.due_date ? dateValue(fullDetail?.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.due_date || fullDetail?.due_date) : undefined} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="h-6 min-w-28 bg-transparent text-[10px] outline-none" />{draft.due_date ? <button type="button" onClick={() => setDraft({ ...draft, due_date: '' })} aria-label="Remove target date" className="rounded-full p-1 hover:bg-background"><X size={11} /></button> : null}</span> : item.effective_due_date ? <span className={cn(targetDateLabel(item.effective_due_date).includes('ago') && 'text-red-600')}>{targetDateLabel(item.effective_due_date)}{!item.has_fixed_due_date ? ' · phase' : ''}</span> : null}{!open && status === 'completed' ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check size={11} />Completed</span> : null}</>}
      supplemental={helping ? <span className="mt-2 flex items-center gap-2"><PersonAvatar user={item.subject} size="xs" /><span><span className="block text-[10px] font-black text-foreground">{item.subject.name?.split(' ')[0]}’s plan</span><span className="block text-[9px] text-muted-foreground">My role: {item.viewer_role?.name || 'Collaborator'}</span></span></span> : null}
      open={open}
      editing={editing}
      color={color}
      progress={{ completed: completeFields, total: fields.length, locked: stepsReady && !canMarkComplete, complete: status === 'completed' }}
      actions={item.can_edit ? editing ? <span className="flex items-center gap-1"><button type="button" onClick={cancelDefinition} disabled={saving} aria-label="Cancel editing objective" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"><X size={14} /></button><button type="button" onClick={() => void saveDefinition()} disabled={saving || !draft.title?.trim()} aria-label="Save objective" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button></span> : <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Objective options" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><MoreVertical size={16} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setOpen(true); setEditing(true) }}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem onClick={() => void removeObjective()} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <span />}
      onToggle={() => setOpen(!open)}
    />
    {open ? <div className="px-3 pb-5 sm:px-4">
      <div className="border-t border-border/60 pt-4">
        {editing ? <textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add a description" className={cn(inlineEditableClass, 'min-h-16 w-full resize-y text-xs leading-5 text-muted-foreground')} /> : item.description ? <button type="button" onClick={() => setDescriptionOpen(!descriptionOpen)} className={cn('block w-full text-left text-xs leading-5 text-muted-foreground', !descriptionOpen && 'line-clamp-2')}>{item.description}</button> : <p className="text-xs text-muted-foreground">No description yet.</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">{(editing ? draft.fields || [] : fields).map((field: any, index: number) => {
        if (field.type === 'badge') {
          const progress = Number(field.progress_percent || 0)
          const badgeImage = field.badge?.thumbnail_image ? normalizeMediaUrl(field.badge.thumbnail_image) : ''
          if (editing) return <div key={fieldKey(field) || index}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><StepPicker badges={badgeChoices} onAdd={(type, options) => changeStepType(index, type, options)} trigger={<button type="button" disabled={supportingLocked} aria-label="Change step type" className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card disabled:opacity-50">{badgeImage ? <img src={badgeImage} alt="" className="h-full w-full object-cover" /> : <Award size={14} className="text-muted-foreground" />}<ChevronDown size={9} className="ml-0.5" /></button>} /><input disabled={supportingLocked} value={field.title || ''} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate) })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-[11px] font-black disabled:opacity-60')} /><button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, candidateIndex: number) => candidateIndex !== index) })} className="rounded p-1 text-muted-foreground hover:text-red-700 disabled:opacity-30"><X size={12} /></button></div><p className="mt-1.5 text-[9px] font-bold text-muted-foreground">Badge step</p></div>
          return <div key={fieldKey(field) || index}><Link href={getUriWithOrg(orgslug, field.badge_href)} className={cn('relative flex h-12 w-full items-center gap-2 overflow-hidden rounded-xl px-3 text-left transition', progress >= 100 && 'ring-1 ring-emerald-500/30')} style={{ background: progress >= 100 ? 'rgb(16 185 129 / 0.14)' : `linear-gradient(to right, #a3a3a3 ${progress}%, #e5e5e5 ${progress}%)` }}><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/80">{badgeImage ? <img src={badgeImage} alt="" className="h-full w-full object-cover" /> : <Award size={15} className="text-neutral-600" />}</span><span className="relative z-10 min-w-0 flex-1 truncate text-[11px] font-black text-neutral-950">{field.title || field.badge?.name || 'Badge'}</span>{progress >= 100 ? <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={11} strokeWidth={3} /></span> : <span className="relative z-10 text-[9px] font-black text-neutral-700">{progress}%</span>}</Link></div>
        }
        const restricted = fieldIsRestricted(field)
        const capability = restricted ? 'contribute_restricted_fields' : 'contribute_fields'
        const canUse = item.can_update && item[restricted ? 'can_contribute_restricted_fields' : 'can_contribute_fields'] && !item.blocked
        if (editing) return <div key={fieldKey(field) || index}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><StepPicker badges={badgeChoices} onAdd={(type, options) => changeStepType(index, type, options)} trigger={<button type="button" disabled={supportingLocked} aria-label="Change step type" className="flex h-8 w-11 shrink-0 items-center justify-between rounded-lg border border-border bg-card px-2 text-muted-foreground disabled:opacity-50"><RequirementTypeIcon type={field.type} size={14} /><ChevronDown size={10} /></button>} /><input disabled={supportingLocked} value={field.title || ''} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate) })} placeholder="Step name" className={cn(inlineEditableClass, 'min-w-0 flex-1 text-[11px] font-black disabled:opacity-60')} /><button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, candidateIndex: number) => candidateIndex !== index) })} className="rounded p-1 text-muted-foreground hover:text-red-700 disabled:opacity-30"><X size={12} /></button></div>{field.type === 'media' ? <p className="mt-1.5 text-[9px] font-bold text-muted-foreground">Accepts {(field.allowed_types || ['image', 'document']).join(', ')}</p> : null}{fullDetail?.collaborators?.some((person: any) => !person.is_subject) ? <button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, restricted: !restricted, access: !restricted ? 'reviewer' : 'contributor' } : candidate) })} className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-muted-foreground disabled:opacity-30">{restricted ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Restricted</button> : null}</div>
        const stepComplete = hasFieldValue(fieldValues[fieldKey(field)])
        return <div key={fieldKey(field) || index}><button type="button" disabled={!canUse || supportingLocked} onClick={() => openStep(field)} className={cn('flex h-12 w-full items-center gap-2 rounded-xl px-3 text-left transition', stepComplete ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/25 dark:bg-emerald-950/20 dark:text-emerald-100' : canUse && !supportingLocked ? 'bg-muted hover:bg-muted/80' : 'bg-muted/50 text-muted-foreground')}><span className={cn(stepComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>{canUse ? <RequirementTypeIcon type={field.type} /> : <Lock size={15} />}</span><span className="min-w-0 flex-1 truncate text-[11px] font-black">{field.title || 'Step'}</span>{stepComplete ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={11} strokeWidth={3} /></span> : null}</button><AccessPeopleLine item={item} capability={capability} unlocked={Boolean(canUse)} /></div>
      })}{editing && !supportingLocked ? <StepPicker badges={badgeChoices} onAdd={addRequirement} /> : null}</div>
      {!editing && activeField ? (() => { const field = fields.find((candidate: any) => fieldKey(candidate) === activeField); if (!field) return null; return <div className="mt-4 rounded-xl bg-muted p-3">{field.type === 'text' ? <textarea autoFocus value={fieldValues[activeField] || ''} onChange={(event) => setFieldValues({ ...fieldValues, [activeField]: event.target.value })} className="min-h-20 w-full resize-y bg-transparent text-xs outline-none" placeholder="Jot down notes…" /> : <input autoFocus value={fieldValues[activeField] || ''} onChange={(event) => setFieldValues({ ...fieldValues, [activeField]: event.target.value })} className="h-9 w-full bg-transparent text-xs outline-none" placeholder="Add a file or link" />}<div className="mt-2 flex justify-end"><button type="button" disabled={saving || !hasFieldValue(fieldValues[activeField])} onClick={() => void saveProgress('in_progress', { [activeField]: fieldValues[activeField] })} className="rounded-lg bg-foreground px-3 py-2 text-[10px] font-black text-background disabled:opacity-40">Save step</button></div></div> })() : null}
      {!editing ? <div className="mt-5">{item.can_review && status === 'submitted' ? <div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => void saveProgress('changes_requested')} className="rounded-xl bg-muted px-3 py-3 text-xs font-black">Request changes</button><button disabled={saving || !stepsReady} onClick={() => void saveProgress('completed')} className="rounded-xl bg-foreground px-3 py-3 text-xs font-black text-background disabled:opacity-40">Approve</button></div> : <button type="button" disabled={status === 'completed' ? !canReopen || saving : !canCompleteNow || saving} onClick={() => void saveProgress()} className={cn('relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-xs font-black transition', status === 'completed' ? 'text-emerald-800 dark:text-emerald-200' : canCompleteNow ? 'text-white shadow-sm hover:brightness-95' : 'text-muted-foreground')} style={{ background: completionBackground }}><span className="relative z-10 flex items-center gap-2">{status === 'completed' ? <RotateCcw size={14} /> : canCompleteNow ? <Check size={14} /> : <Lock size={14} />}{status === 'completed' ? 'Reopen objective' : stepsReady && !canMarkComplete ? 'Ready · waiting for permission' : fields.length ? `Complete ${completeFields}/${fields.length} steps` : 'Mark complete'}</span></button>}<AccessPeopleLine item={item} capability={completionCapability} unlocked={Boolean(canMarkComplete)} /></div> : null}
      {editing ? <div className="mt-5"><button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-xs font-black text-muted-foreground"><Check size={14} />{status === 'completed' ? 'Reopen to change steps' : 'Mark complete'}</button>{fullDetail?.collaborators?.some((person: any) => !person.is_subject) ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2"><button type="button" onClick={() => setDraft({ ...draft, completion_restricted: !draft.completion_restricted })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.completion_restricted ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Restricted completion</button><button type="button" onClick={() => setDraft({ ...draft, blocked: !draft.blocked })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.blocked ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Blocked for now</button>{item.can_schedule ? <button type="button" onClick={() => setDraft({ ...draft, allow_late: !draft.allow_late })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.allow_late ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Allow late completion</button> : null}</div> : null}</div> : null}
    </div> : null}
    <Modal isDialogOpen={Boolean(noteField)} onOpenChange={(nextOpen) => { if (!nextOpen) setNoteField(null) }} minHeight="no-min" minWidth="md" dialogTitle={noteField?.title || 'Note'} dialogDescription="Add useful detail and format it so it is easy to revisit." dialogContent={<div className="space-y-4 p-2"><DiscussionEditor content={noteDraft} onChange={setNoteDraft} placeholder="Jot down what you learn…" minHeight="180px" /><button type="button" disabled={saving} onClick={() => void saveNote()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save note</button></div>} />
    <Modal isDialogOpen={Boolean(linksField)} onOpenChange={(nextOpen) => { if (!nextOpen) setLinksField(null) }} minHeight="no-min" minWidth="md" dialogTitle={linksField?.title || 'Links'} dialogDescription="Add one or more web links for this step." dialogContent={<div className="space-y-3 p-2"><div className="space-y-2">{linkDrafts.map((value, index) => <div key={index} className="flex items-center gap-2"><label className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-border bg-background focus-within:border-foreground"><span className="h-full shrink-0 border-r border-border bg-muted px-3 text-[11px] font-bold leading-[2.75rem] text-muted-foreground">https://www.</span><input autoFocus={index === 0} value={value} onChange={(event) => setLinkDrafts(linkDrafts.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value.replace(/^https?:\/\/(www\.)?/, '') : candidate))} placeholder="example.com/page" aria-label={`Link ${index + 1}`} className="h-full min-w-0 flex-1 bg-transparent px-3 text-xs outline-none" /></label>{linkDrafts.length > 1 ? <button type="button" onClick={() => setLinkDrafts(linkDrafts.filter((_, candidateIndex) => candidateIndex !== index))} aria-label={`Remove link ${index + 1}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-700"><X size={14} /></button> : null}</div>)}</div><button type="button" onClick={() => setLinkDrafts([...linkDrafts, ''])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-black text-muted-foreground hover:bg-muted"><Plus size={12} />Add another link</button>{!linksValid && linkDrafts.some((value) => value.length > 0) ? <p className="text-[10px] font-bold text-red-600">Enter a valid address after https://www.</p> : null}<button type="button" disabled={saving || !linksValid} onClick={() => void saveLinks()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save links</button></div>} />
    <Modal isDialogOpen={Boolean(checkboxField)} onOpenChange={(nextOpen) => { if (!nextOpen) setCheckboxField(null) }} minHeight="no-min" minWidth="sm" dialogTitle={checkboxField?.title || 'Checkbox'} dialogDescription="Confirm whether this requirement is complete." dialogContent={<div className="space-y-4 p-2"><button type="button" onClick={() => setCheckboxDraft(!checkboxDraft)} className={cn('flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm font-black', checkboxDraft ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-border')}><span className={cn('flex h-6 w-6 items-center justify-center rounded-md border', checkboxDraft && 'border-emerald-600 bg-emerald-600 text-white')}>{checkboxDraft ? <Check size={14} /> : null}</span>{checkboxField?.title}</button><button type="button" disabled={saving} onClick={async () => { if (!checkboxField) return; await saveStepValues({ [fieldKey(checkboxField)]: checkboxDraft }); setCheckboxField(null) }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save checkbox</button></div>} />
    <Modal isDialogOpen={Boolean(mediaField && !mediaType)} onOpenChange={(nextOpen) => { if (!nextOpen) setMediaField(null) }} minHeight="no-min" minWidth="sm" dialogTitle={mediaField?.title || 'Choose media'} dialogDescription="What kind of media do you want to add?" dialogContent={<div className="space-y-2 p-2">{((mediaField?.allowed_types || ['image', 'document']) as MediaType[]).map((type) => <button key={type} type="button" onClick={() => setMediaType(type)} className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left text-xs font-black hover:bg-muted"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">{type === 'image' ? <ImageIcon size={15} /> : type === 'video' ? <Film size={15} /> : <FileText size={15} />}</span><span className="flex-1 capitalize">{type === 'document' ? 'Document (PDF)' : type}</span><ChevronRight size={14} className="text-muted-foreground" /></button>)}</div>} />
    {viewerUserId && mediaField && mediaType ? <MediaPickerDialog open onOpenChange={(nextOpen) => { if (!nextOpen) { setMediaType(null); setMediaField(null) } }} title={`Add ${mediaType === 'document' ? 'document' : mediaType}`} description="Upload something new or choose it from your media library." owner={{ type: 'user', id: Number(viewerUserId) }} mediaType={mediaType} accessToken={token} onSave={saveMedia} /> : null}
  </article>
}
