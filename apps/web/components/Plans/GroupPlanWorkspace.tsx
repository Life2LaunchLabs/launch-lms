'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { AlertCircle, Check, CheckCircle2, Circle, Clock3, FileCheck2, FileText, Link2, Loader2, Lock, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { DiscussionEditor } from '@components/Objects/Communities/DiscussionEditor'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { programsApi } from '@services/programs/programs'
import { getLearningBadges } from '@services/learning/learning'
import { getUriWithOrg } from '@services/config/config'
import { PlanObjectiveDefinitionCard, PlanWorkspaceHeader, StepTypeIcon, normalizePlanSteps } from './PlanEditorShared'
import { cn } from '@/lib/utils'
import type { MediaAsset, MediaType } from '@services/media/library'

type Filter = 'all' | 'attention' | 'review'

// eslint-disable-next-line no-unused-vars
export default function GroupPlanWorkspace({ orgslug, assignmentUuid, embedded = false, onClose, onChanged, color = '#2563eb', onSetColor }: { orgslug: string; assignmentUuid: string; embedded?: boolean; onClose?: () => void; onChanged?: () => Promise<void> | void; color?: string; onSetColor?: (value: string) => void }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const key = token ? ['group-plan-workspace', assignmentUuid, token] : null
  const { data, error, isLoading, mutate } = useSWR(key, ([, uuid, accessToken]) => programsApi.matrix(undefined, uuid, accessToken), { revalidateOnFocus: true })
  const { data: badgeChoices = [] } = useSWR<any[]>(token ? ['group-plan-step-badges', token] : null, async ([, accessToken]: [string, string]) => {
    const response = await getLearningBadges(undefined, accessToken)
    return Array.isArray(response) ? response : response?.data || []
  })
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [selectedCell, setSelectedCell] = React.useState<any>(null)
  const [savingObjective, setSavingObjective] = React.useState('')
  const [lifecycleSaving, setLifecycleSaving] = React.useState(false)
  const [cellSaving, setCellSaving] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [mobilePanel, setMobilePanel] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (error) {
    const message = error?.message || 'This group plan could not be opened.'
    const failure = <div className="mx-auto my-12 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><h2 className="text-lg font-black text-red-950">Could not open group plan</h2><p className="mt-2 text-sm text-red-800">{message}</p>{onClose ? <button type="button" onClick={onClose} className="mt-5 rounded-lg bg-red-950 px-4 py-2 text-xs font-black text-white">Back to plans</button> : null}</div>
    return embedded ? failure : <GeneralWrapperStyled>{failure}</GeneralWrapperStyled>
  }
  if (isLoading || !data) {
    const loader = <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
    return embedded ? loader : <GeneralWrapperStyled>{loader}</GeneralWrapperStyled>
  }
  const learners = (data.learners || []).filter((learner: any) => {
    const matches = `${learner.first_name || ''} ${learner.last_name || ''} ${learner.username || ''}`.toLowerCase().includes(query.toLowerCase())
    if (!matches) return false
    const cells = Object.values(learner.cells || {}) as any[]
    if (filter === 'review') return cells.some((cell) => cell.status === 'submitted')
    if (filter === 'attention') return cells.some((cell) => cell.blocked || cell.status === 'changes_requested' || cell.due_date && new Date(cell.due_date).getTime() < Date.now() && cell.status !== 'completed')
    return true
  })
  const progress = (data.learners || []).map((learner: any) => Number(learner.progress_percent || 0))
  const min = progress.length ? Math.min(...progress) : 0
  const max = progress.length ? Math.max(...progress) : 0
  const assignmentOrgId = Number(data.assignment?.org_id || orgId)
  const canEditDefinition = (data.learners || []).some((learner: any) => learner.capabilities?.includes('edit_structure'))
  const canComplete = (data.learners || []).some((learner: any) => learner.capabilities?.includes('complete_plan'))
  const canDelete = canEditDefinition || data.assignment?.owner?.id === session?.data?.user?.id
  const allCompleted = Boolean(data.learners?.length) && data.learners.every((learner: any) => learner.lifecycle === 'completed')
  const changeLifecycle = async (action: 'complete' | 'reopen') => {
    if (action === 'complete' && min < 100 && !window.confirm(`Some learners still have unfinished objectives. Complete all ${data.learners.length} plans anyway?`)) return
    setLifecycleSaving(true)
    try {
      await programsApi.assignmentStatus(assignmentOrgId, assignmentUuid, action, token)
      await mutate(); await onChanged?.()
      toast.success(action === 'complete' ? `${data.learners.length} plans marked complete.` : `${data.learners.length} plans reopened.`)
      if (action === 'complete') onClose?.()
    } catch (error: any) { toast.error(error?.message || 'Could not update the group plan.') } finally { setLifecycleSaving(false) }
  }
  const deleteGroupPlan = async () => {
    if (!window.confirm(`Delete this group plan and all ${data.learners.length} learner plans? This permanently removes their objectives, progress, evidence, and activity.`)) return
    setLifecycleSaving(true)
    try {
      await programsApi.deleteAssignment(assignmentOrgId, assignmentUuid, token)
      await onChanged?.()
      toast.success('Group plan deleted.')
      if (onClose) onClose()
      else window.location.href = getUriWithOrg(orgslug, '/admin/plans/live')
    } catch (error: any) { toast.error(error?.message || 'Could not delete the group plan.') } finally { setLifecycleSaving(false) }
  }
  const saveObjective = async (objective: any, draft: any) => {
    setSavingObjective(objective.objective_uuid)
    try {
      await programsApi.updateAssignmentObjective(assignmentOrgId, assignmentUuid, objective.objective_uuid, { definition_version: data.definition_version, title: draft.title, description: draft.description || '', fields: draft.fields, completion_restricted: Boolean(draft.completion_restricted), allow_late: Boolean(draft.allow_late) }, token)
      await mutate(); toast.success(`Updated for ${data.learners.length} learner plans.`)
    } catch (error: any) { toast.error(error?.message || 'Could not update the group objective.') } finally { setSavingObjective('') }
  }
  const completeObjective = async (learner: any, objective: any, complete: boolean) => {
    try {
      await programsApi.updateProgress(assignmentOrgId, { objective_uuid: objective.objective_uuid, user_ids: [learner.id], plan_uuids: [learner.plan_uuid], status: complete ? 'completed' : 'in_progress' }, token)
      await mutate(); toast.success(complete ? 'Objective completed.' : 'Objective reopened.')
    } catch (error: any) { toast.error(error?.message || 'Could not update progress.') }
  }
  const saveCellValue = async (selected: any, value: any) => {
    const fieldUuid = selected.step.field_uuid
    setCellSaving(true)
    try {
      await programsApi.updateProgress(assignmentOrgId, { objective_uuid: selected.objective.objective_uuid, user_ids: [selected.learner.id], plan_uuids: [selected.learner.plan_uuid], status: 'in_progress', field_values: { ...(selected.cell.field_values || {}), [fieldUuid]: value } }, token)
      await mutate(); setSelectedCell(null); toast.success('Step saved.')
    } catch (error: any) { toast.error(error?.message || 'Could not save the step.') } finally { setCellSaving(false) }
  }
  const title = `${data.cohort?.name || 'Group'}’s plan`
  const sidebar = <GroupPlanInspector data={data} title={title} color={color} onSetColor={onSetColor} min={min} max={max} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filteredCount={learners.length} canComplete={canComplete} canDelete={canDelete} allCompleted={allCompleted} saving={lifecycleSaving} changeLifecycle={changeLifecycle} deleteGroupPlan={deleteGroupPlan} />
  const content = <main className={cn('mx-auto w-full max-w-[1500px]', embedded ? 'py-0' : 'px-4 py-6 sm:px-6')}>
    {onClose ? <PlanWorkspaceHeader title={title} color={color} onClose={onClose} onOpenPanel={() => setMobilePanel(true)} /> : null}
    {!onClose && !embedded ? <div className="flex items-center justify-between"><h1 className="text-2xl font-black">{title}</h1><Link href={getUriWithOrg(orgslug, '/plans')} className="text-xs font-black">Back to plans</Link></div> : null}
    <div className="mt-8 space-y-10">{(data.phases || []).map((phase: any) => <section id={`group-plan-phase-${phase.phase_uuid}`} key={phase.phase_uuid}><div className="mb-3 flex items-end gap-3"><h2 className="text-sm font-black uppercase tracking-[0.12em]">{phase.name}</h2>{phase.due_date ? <span className="text-xs text-muted-foreground">Target {new Date(`${phase.due_date}T12:00:00`).toLocaleDateString()}</span> : null}</div><div className="space-y-2">{phase.objectives.map((objective: any) => <PlanObjectiveDefinitionCard key={objective.objective_uuid} objective={{ ...objective, fields: objective.fields || objective.custom_fields || [], completion_restricted: !objective.allow_learner_confirmation }} mode="group-live" color={color} canEdit={canEditDefinition} badges={badgeChoices} saving={savingObjective === objective.objective_uuid} onSave={(draft) => saveObjective(objective, draft)}><ObjectiveMatrix objective={objective} learners={learners} onCell={setSelectedCell} onComplete={completeObjective} /></PlanObjectiveDefinitionCard>)}</div></section>)}</div>
    <CellModal selected={selectedCell} setSelected={setSelectedCell} onSave={saveCellValue} saving={cellSaving} token={token} viewerUserId={session?.data?.user?.id} />
  </main>
  const workspace = embedded ? content : <GeneralWrapperStyled>{content}</GeneralWrapperStyled>
  return <>{workspace}{onClose && mounted && document.getElementById('org-layout-right-sidebar') ? createPortal(<div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pb-6">{sidebar}</div>, document.getElementById('org-layout-right-sidebar')!) : null}{onClose && mobilePanel ? <div className="fixed inset-0 z-[var(--z-modal)] bg-black/35 lg:hidden" onClick={() => setMobilePanel(false)}><aside onClick={(event) => event.stopPropagation()} className="ml-auto h-full w-[min(92vw,360px)] overflow-y-auto bg-background p-4 shadow-2xl"><div className="mb-3 flex justify-end"><button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div>{sidebar}</aside></div> : null}</>
}

const GROUP_PLAN_COLORS = ['#7c3aed', '#0f9f9a', '#d97706', '#2563eb', '#db2777', '#65a30d', '#dc2626', '#0891b2']

function GroupPlanInspector({ data, title, color, onSetColor, min, max, query, setQuery, filter, setFilter, filteredCount, canComplete, canDelete, allCompleted, saving, changeLifecycle, deleteGroupPlan }: any) {
  const [editingColor, setEditingColor] = React.useState(false)
  return <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start gap-3"><button type="button" onClick={() => setEditingColor(!editingColor)} aria-label="Change plan color" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: color }}>{editingColor ? <X size={14} /> : <Pencil size={14} />}</button><div className="min-w-0 flex-1"><h2 className="truncate text-base font-black">{title}</h2><p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{data.program?.name || data.assignment?.program_name}</p></div></div>
    {editingColor ? <div className="grid grid-cols-8 gap-1.5">{GROUP_PLAN_COLORS.map((item) => <button key={item} type="button" onClick={() => { onSetColor?.(item); setEditingColor(false) }} aria-label={`Use ${item}`} className={cn('h-7 rounded-lg border-2', item === color ? 'border-foreground' : 'border-transparent')} style={{ backgroundColor: item }} />)}</div> : null}
    <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Progress</p><div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: `linear-gradient(to right, ${color} 0 ${min}%, color-mix(in srgb, ${color} 48%, transparent) ${min}% ${max}%, color-mix(in srgb, ${color} 14%, transparent) ${max}% 100%)` }} /></div>
    <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Target completion</p><p className="mt-1 text-xs font-bold">{data.assignment?.due_date ? new Date(data.assignment.due_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'No target date'}</p></div>
    <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Description</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{data.program?.description || 'No description yet.'}</p></div>
    <div className="border-t border-border pt-4"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Learners</p><label className="relative mt-2 block"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a learner" className="h-9 w-full rounded-lg border border-border pl-8 pr-2 text-xs" /></label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">{(['all', 'attention', 'review'] as Filter[]).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn('rounded-md px-1 py-1.5 text-[9px] font-black', filter === value && 'bg-card shadow-sm')}>{value === 'attention' ? 'Attention' : value === 'review' ? 'Review' : 'All'}</button>)}</div><p className="mt-2 text-[9px] font-bold text-muted-foreground">Showing {filteredCount} of {data.learners.length}</p></div>
    <div className="border-t border-border pt-4"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Collaborators</p><div className="mt-2 space-y-2">{(data.assignment?.staff || []).slice(0, 4).map((person: any) => <div key={person.id} className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[9px] font-black text-background">{String(person.first_name || person.username || '?')[0]}</span><span className="min-w-0 flex-1 truncate text-xs font-black">{[person.first_name, person.last_name].filter(Boolean).join(' ') || person.username}</span></div>)}{!data.assignment?.staff?.length ? <p className="text-[10px] text-muted-foreground">No collaborators yet.</p> : null}</div></div>
    <div className="border-t border-border pt-4"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Phases</p><div className="mt-2 space-y-1">{(data.phases || []).map((phase: any) => <button key={phase.phase_uuid} type="button" onClick={() => document.getElementById(`group-plan-phase-${phase.phase_uuid}`)?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-muted"><span className="truncate text-xs font-black">{phase.name}</span>{phase.due_date ? <span className="text-[9px] text-muted-foreground">{new Date(`${phase.due_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}</button>)}</div></div>
    {canComplete ? <button disabled={saving} onClick={() => void changeLifecycle(allCompleted ? 'reopen' : 'complete')} className={cn('flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black disabled:opacity-40', allCompleted ? 'border border-border' : 'bg-foreground text-background')}>{allCompleted ? <RotateCcw size={13} /> : <Check size={13} />}{allCompleted ? 'Reopen plans' : 'Complete plans'}</button> : null}
    {canDelete ? <button disabled={saving} onClick={() => void deleteGroupPlan()} className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 size={13} />Delete group plan</button> : null}
  </div>
}

function ObjectiveMatrix({ objective, learners, onCell, onComplete }: any) {
  const steps = normalizePlanSteps(objective.fields || objective.custom_fields || [])
  const keyFor = (learner: any) => learner.cells?.[objective.objective_uuid] || learner.cells?.[String(objective.source_objective_id)] || {}
  return <div className="mt-4 w-fit max-w-full overflow-x-auto rounded-xl border border-border" role="table" aria-label={`${objective.title} learner progress`}>
    <div className="min-w-max">
      <div className="flex h-9 items-center border-b border-border bg-muted/60" role="row">
        <div className="w-40 shrink-0 px-3 text-[9px] font-black uppercase tracking-wide text-muted-foreground" role="columnheader">Learner</div>
        {steps.map((step) => <div key={step.field_uuid} className="flex w-10 shrink-0 items-center justify-center" role="columnheader"><span title={step.title} aria-label={step.title} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground"><StepTypeIcon type={step.type} size={13} /></span></div>)}
        <div className="flex w-10 shrink-0 items-center justify-center" role="columnheader"><span title="Objective status" aria-label="Objective status" className="flex h-7 w-7 items-center justify-center text-muted-foreground"><CheckCircle2 size={13} /></span></div>
      </div>
      {learners.map((learner: any) => {
        const cell = keyFor(learner)
        const values = cell.field_values || {}
        const name = [learner.first_name, learner.last_name].filter(Boolean).join(' ') || learner.username
        return <div key={learner.plan_uuid} className="flex h-11 items-center border-b border-border last:border-b-0 hover:bg-muted/20" role="row">
          <div className="flex w-40 shrink-0 items-center gap-2 px-3" role="rowheader" title={name}><span className="min-w-0 flex-1 truncate text-[11px] font-black">{name}</span><span className="shrink-0 text-[9px] font-bold tabular-nums text-muted-foreground">{learner.progress_percent}%</span></div>
          {steps.map((step) => {
            const value = values[step.field_uuid]
            const done = step.type === 'badge' ? Number(value?.progress_percent || step.progress_percent || 0) >= 100 : Array.isArray(value) ? value.length > 0 : Boolean(value)
            const state = stepStatusLabel(step, done, cell)
            return <div key={step.field_uuid} className="flex w-10 shrink-0 items-center justify-center" role="cell"><button type="button" onClick={() => onCell({ learner, objective, step, value, cell })} aria-label={`${step.title} for ${name}: ${state}`} title={`${step.title} · ${state}`} className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition', done ? 'bg-emerald-100 text-emerald-700' : cell.blocked ? 'bg-neutral-100 text-neutral-500' : cell.status === 'changes_requested' ? 'bg-red-100 text-red-700' : cell.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'text-muted-foreground hover:bg-blue-50 hover:text-blue-700')}><StepStatusIcon step={step} done={done} status={cell.status} blocked={cell.blocked} /></button></div>
          })}
          <div className="flex w-10 shrink-0 items-center justify-center" role="cell"><button type="button" onClick={() => onComplete(learner, objective, cell.status !== 'completed')} aria-label={`${cell.status === 'completed' ? 'Reopen' : 'Complete'} ${objective.title} for ${name}`} title={objectiveStatusLabel(cell)} className={cn('flex h-7 w-7 items-center justify-center rounded-full transition', cell.status === 'completed' ? 'bg-emerald-600 text-white' : cell.blocked ? 'bg-neutral-100 text-neutral-500' : cell.status === 'changes_requested' ? 'bg-red-100 text-red-700' : cell.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700')}>{cell.status === 'completed' ? <Check size={13} strokeWidth={3} /> : cell.blocked ? <Lock size={12} /> : cell.status === 'changes_requested' ? <AlertCircle size={13} /> : cell.status === 'submitted' ? <Clock3 size={13} /> : <Circle size={12} />}</button></div>
        </div>
      })}
      {!learners.length ? <p className="w-60 p-6 text-center text-xs text-muted-foreground">No learners match this filter.</p> : null}
    </div>
  </div>
}

function StepStatusIcon({ step, done, status, blocked }: { step: any; done: boolean; status?: string; blocked?: boolean }) {
  if (blocked) return <Lock size={12} />
  if (status === 'changes_requested' && !done) return <AlertCircle size={13} />
  if (status === 'submitted' && !done) return <Clock3 size={13} />
  if (!done) return <Circle size={11} />
  if (step.type === 'media') return <FileCheck2 size={13} />
  if (step.type === 'link') return <Link2 size={13} />
  if (step.type === 'checkbox') return <Check size={13} strokeWidth={3} />
  if (step.type === 'badge') return <CheckCircle2 size={13} />
  return <FileText size={13} />
}

function stepStatusLabel(step: any, done: boolean, cell: any) {
  if (done) {
    if (step.type === 'media') return 'file uploaded'
    if (step.type === 'link') return 'link added'
    if (step.type === 'checkbox') return 'checked'
    if (step.type === 'badge') return 'badge complete'
    return 'response added'
  }
  if (cell.blocked) return 'blocked'
  if (cell.status === 'changes_requested') return 'changes requested'
  if (cell.status === 'submitted') return 'ready for review'
  return 'incomplete'
}

function objectiveStatusLabel(cell: any) {
  if (cell.status === 'completed') return 'Objective complete'
  if (cell.blocked) return 'Objective blocked'
  if (cell.status === 'changes_requested') return 'Changes requested'
  if (cell.status === 'submitted') return 'Ready for review'
  return 'Objective incomplete'
}

function CellModal({ selected, setSelected, onSave, saving, token, viewerUserId }: any) {
  const [draft, setDraft] = React.useState<any>('')
  const [mediaType, setMediaType] = React.useState<MediaType | null>(null)
  React.useEffect(() => {
    if (!selected) return
    if (selected.step.type === 'link') setDraft(Array.isArray(selected.value) ? selected.value.join('\n') : '')
    else setDraft(selected.value ?? (selected.step.type === 'checkbox' ? false : ''))
    setMediaType(null)
  }, [selected])
  if (!selected) return null
  const value = selected.value
  const capabilities = selected.learner.capabilities || []
  const restricted = Boolean(selected.step.restricted || ['reviewer', 'staff'].includes(selected.step.access))
  const canEdit = capabilities.includes('update_progress') && capabilities.includes(restricted ? 'contribute_restricted_fields' : 'contribute_fields') && !selected.cell.blocked && selected.cell.status !== 'completed' && selected.step.type !== 'badge'
  const linkDraft = String(draft || '').split('\n').map((item) => item.trim()).filter(Boolean)
  const mediaValues = Array.isArray(draft) ? draft : Array.isArray(value) ? value : []
  const editor = selected.step.type === 'text' ? <DiscussionEditor content={draft || ''} onChange={setDraft} placeholder="Jot down what you learn…" minHeight="180px" /> : selected.step.type === 'checkbox' ? <button type="button" onClick={() => setDraft(!draft)} className={cn('flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm font-black', draft ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-border')}><span className={cn('flex h-6 w-6 items-center justify-center rounded-md border', draft && 'border-emerald-600 bg-emerald-600 text-white')}>{draft ? <Check size={14} /> : null}</span>{selected.step.title}</button> : selected.step.type === 'link' ? <textarea autoFocus value={draft || ''} onChange={(event) => setDraft(event.target.value)} placeholder="One URL per line" className="min-h-32 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none" /> : selected.step.type === 'media' ? <div className="space-y-2">{mediaValues.map((item: any, index: number) => <div key={item.asset_uuid || item.url || index} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm"><FileCheck2 size={14} className="text-emerald-700" /><span className="min-w-0 flex-1 truncate font-bold">{item.title || item.filename || item.url || 'Uploaded media'}</span>{canEdit ? <button type="button" onClick={() => setDraft(mediaValues.filter((_: any, itemIndex: number) => itemIndex !== index))} className="text-red-600"><X size={13} /></button> : null}</div>)}{canEdit ? <div className="grid gap-2 sm:grid-cols-3">{((selected.step.allowed_types || ['image', 'document']) as MediaType[]).map((type) => <button key={type} type="button" onClick={() => setMediaType(type)} className="rounded-xl border border-dashed border-border px-3 py-3 text-xs font-black capitalize">Add {type === 'document' ? 'document' : type}</button>)}</div> : null}</div> : value ? <div className="whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</div> : <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">Nothing submitted yet.</div>
  const saveValue = selected.step.type === 'link' ? linkDraft : selected.step.type === 'media' ? mediaValues : draft
  return <><Modal isDialogOpen onOpenChange={(open) => !open && setSelected(null)} minHeight="no-min" minWidth="md" dialogTitle={selected.step.title} dialogDescription={`${[selected.learner.first_name, selected.learner.last_name].filter(Boolean).join(' ') || selected.learner.username} · ${selected.objective.title}`} dialogContent={<div className="space-y-4">{editor}{canEdit ? <button disabled={saving || selected.step.type === 'link' && !linkDraft.length} onClick={() => void onSave(selected, saveValue)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save step</button> : <p className="text-xs font-bold text-muted-foreground">Your role can view this value but cannot change it.</p>}</div>} />{viewerUserId && mediaType ? <MediaPickerDialog open onOpenChange={(open) => { if (!open) setMediaType(null) }} title={`Add ${mediaType === 'document' ? 'document' : mediaType}`} description="Upload something new or choose it from your media library." owner={{ type: 'user', id: Number(viewerUserId) }} mediaType={mediaType} accessToken={token} onSave={(asset: MediaAsset) => { setDraft([...mediaValues, asset]); setMediaType(null) }} /> : null}</>
}
