'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, ChevronRight, Loader2, Lock, Search, X } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import { EmptyState, PageLoader, personName, StepTypeIcon } from './shared'

type CellKey = string // `${plan_uuid}|${objective_uuid}`

const LOOK: Record<string, { cls: string; label: string }> = {
  completed: { cls: 'bg-green-100 text-green-700', label: '' },
  submitted: { cls: 'bg-blue-100 text-blue-700', label: 'Review' },
  changes_requested: { cls: 'bg-amber-100 text-amber-800', label: 'Changes' },
  in_progress: { cls: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200', label: 'Started' },
  canceled: { cls: 'bg-gray-100 text-gray-500', label: 'Excused' },
  not_started: { cls: 'bg-white text-gray-400 ring-1 ring-inset ring-gray-200', label: '' },
}

export default function GroupPlansGrid({ orgslug, orgId, token, assignmentUuid }: { orgslug: string; orgId: number; token?: string; assignmentUuid: string }) {
  const key = orgId && token ? ['group-plan-matrix', orgId, assignmentUuid] : null
  const { data, isLoading, mutate } = useSWR(key, () => programsApi.matrix(orgId, assignmentUuid, token), { revalidateOnFocus: false })
  const [closed, setClosed] = React.useState<Record<string, boolean>>({})
  const [selected, setSelected] = React.useState<Set<CellKey>>(new Set())
  const [query, setQuery] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState<'completed' | 'canceled' | null>(null)
  React.useEffect(() => { setSelected(new Set()) }, [assignmentUuid])
  if (isLoading || !data) return <PageLoader />

  const phases: any[] = data.phases || []
  const learners: any[] = (data.learners || []).filter((learner: any) => personName(learner).toLowerCase().includes(query.trim().toLowerCase()))
  const total = (data.learners || []).length
  const cellOf = (learner: any, objective: any) => learner.cells?.[objective.objective_uuid]
  const keyOf = (learner: any, objective: any): CellKey => `${learner.plan_uuid}|${objective.objective_uuid}`
  const selectable = (cell: any) => cell && !['completed', 'submitted'].includes(cell.status)
  const toggle = (cellKey: CellKey) => setSelected((current) => { const next = new Set(current); if (next.has(cellKey)) next.delete(cellKey); else next.add(cellKey); return next })
  const columnKeys = (objective: any) => learners.filter((learner) => selectable(cellOf(learner, objective))).map((learner) => keyOf(learner, objective))
  const toggleColumn = (objective: any) => {
    const keys = columnKeys(objective)
    const allOn = keys.length > 0 && keys.every((cellKey) => selected.has(cellKey))
    setSelected((current) => { const next = new Set(current); keys.forEach((cellKey) => allOn ? next.delete(cellKey) : next.add(cellKey)); return next })
  }
  const apply = async (status: 'completed' | 'canceled') => {
    const byObjective = new Map<string, string[]>()
    selected.forEach((cellKey) => { const [planUuid, objectiveUuid] = cellKey.split('|'); byObjective.set(objectiveUuid, [...(byObjective.get(objectiveUuid) || []), planUuid]) })
    setSaving(status)
    let updated = 0, skipped = 0
    try {
      for (const [objectiveUuid, planUuids] of byObjective) {
        const results = await programsApi.updateProgress(orgId, { objective_uuid: objectiveUuid, user_ids: [], plan_uuids: planUuids, status, staff_note: note.trim() }, token)
        updated += (results || []).filter((item: any) => item.status === status).length
        skipped += (results || []).filter((item: any) => item.status === 'skipped').length
      }
      toast.success(`${updated} ${status === 'completed' ? 'marked done' : 'excused'}${skipped ? `; ${skipped} skipped because that learner’s step was changed for them` : ''}.`)
      setSelected(new Set()); setNote('')
      await mutate()
    } catch (error: any) { toast.error(error?.message || 'Could not update these steps.') } finally { setSaving(null) }
  }

  if (!phases.length) return <EmptyState title="This template has no steps" />
  const tracks = ['200px', ...phases.flatMap((phase) => closed[phase.phase_uuid] ? ['104px'] : phase.objectives.map(() => 'minmax(84px,170px)'))]
  const grid = { gridTemplateColumns: tracks.join(' ') }
  const minWidth = 200 + phases.reduce((sum, phase) => sum + (closed[phase.phase_uuid] ? 104 : phase.objectives.length * 88), 0)

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative flex items-center"><span className="sr-only">Search learners</span><Search size={14} className="absolute left-2.5 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${total} learners`} className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px]" /></label>
      <span className="flex-1" />
      <span className="flex flex-wrap gap-3 text-xs text-gray-600">
        <Legend cls="bg-green-100" label="Done" /><Legend cls="bg-blue-100" label="To review" /><Legend cls="bg-amber-100" label="Sent back" /><Legend cls="bg-gray-100" label="Excused" />
      </span>
    </div>
    <p className="text-xs text-gray-500">Click a step to select everyone who hasn’t finished it, or pick cells one by one. Blue cells open the review.</p>
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white nice-shadow">
      <div style={{ minWidth }}>
        <div className="grid gap-1 px-3 pt-2" style={grid}>
          <span />
          {phases.map((phase, index) => {
            const isClosed = Boolean(closed[phase.phase_uuid])
            return <button key={phase.phase_uuid} type="button" aria-expanded={!isClosed} onClick={() => setClosed({ ...closed, [phase.phase_uuid]: !isClosed })} className={cn('flex min-w-0 items-center gap-1.5 rounded-t-lg px-2.5 py-2 text-left', index % 2 ? 'bg-gray-50' : 'bg-gray-100')} style={{ gridColumn: `span ${isClosed ? 1 : phase.objectives.length}` }}>
              <ChevronRight size={12} className={cn('shrink-0 text-gray-500 transition', !isClosed && 'rotate-90')} />
              <span className="truncate text-xs font-black text-gray-900">{phase.name}</span>
              {!isClosed ? <span className="shrink-0 text-[11px] text-gray-500">{phase.objectives.length} steps</span> : null}
            </button>
          })}
        </div>
        <div className="grid items-end gap-1 border-b border-gray-100 px-3 pb-2 pt-1" style={grid}>
          <span className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Learner</span>
          {phases.flatMap((phase) => closed[phase.phase_uuid] ? [<span key={phase.phase_uuid} className="px-1.5 pb-1 text-[11px] text-gray-500">{phasePercent(phase, data.learners || [])}% done</span>] : phase.objectives.map((objective: any) => {
            const keys = columnKeys(objective)
            const on = keys.length > 0 && keys.every((cellKey) => selected.has(cellKey))
            const agg = objective.aggregate || {}
            return <button key={objective.objective_uuid} type="button" aria-pressed={on} onClick={() => toggleColumn(objective)} title={objective.title} className={cn('flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border-2 p-1.5 text-left', on ? 'border-black bg-gray-50' : 'border-transparent hover:bg-gray-50')}>
              <StepTypeIcon types={(objective.fields || []).filter((field: any) => !field.restricted).map((field: any) => field.type)} size={12} />
              <span className="line-clamp-2 text-xs font-bold leading-tight text-gray-900">{objective.title}</span>
              <span className="text-[11px] text-gray-500">{agg.completed_count ?? 0}/{agg.learner_count ?? total}{agg.review_count ? ` · ${agg.review_count} to review` : ''}</span>
            </button>
          }))}
        </div>
        {learners.map((learner) => <div key={learner.plan_uuid} className="grid items-center gap-1 border-b border-gray-50 px-3 py-1" style={grid}>
          <span className="flex min-w-0 items-center gap-2 pr-2">
            {learner.username && learner.id > 0 ? <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(learner.username, 'overview'))} className="truncate text-[13px] font-bold text-gray-900 hover:text-blue-700">{personName(learner)}</Link> : <span className="truncate text-[13px] font-bold text-gray-500">{personName(learner)}</span>}
            {learner.custom_objectives?.length ? <span title={learner.custom_objectives.map((item: any) => item.title).join(', ')} className="shrink-0 rounded-full bg-blue-50 px-1.5 text-[10px] font-bold text-blue-700">+{learner.custom_objectives.length}</span> : null}
            {learner.lifecycle === 'pending' ? <span className="shrink-0 text-[10px] text-gray-400">invited</span> : null}
          </span>
          {phases.flatMap((phase) => closed[phase.phase_uuid] ? [<span key={phase.phase_uuid} className="flex h-9 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-700">{phase.objectives.filter((objective: any) => cellOf(learner, objective)?.status === 'completed').length} of {phase.objectives.length}</span>] : phase.objectives.map((objective: any) => {
            const cell = cellOf(learner, objective)
            if (!cell) return <span key={objective.objective_uuid} className="h-9 rounded-lg bg-gray-50" title="Not in this learner’s plan" />
            const look = LOOK[cell.status] || LOOK.not_started
            const cellKey = keyOf(learner, objective)
            const label = `${personName(learner)}, ${objective.title}`
            if (cell.status === 'submitted') return <Link key={objective.objective_uuid} aria-label={`Review ${label}`} href={getUriWithOrg(orgslug, routePaths.org.dash.planReview({ assignment: assignmentUuid, objective: objective.objective_uuid, focus: cell.plan_objective_uuid }))} className={cn('flex h-9 items-center justify-center rounded-lg text-[11px] font-bold hover:ring-2 hover:ring-blue-300', look.cls)}>Review</Link>
            const on = selected.has(cellKey)
            return <button key={objective.objective_uuid} type="button" aria-label={label} aria-pressed={on} disabled={cell.status === 'completed'} onClick={() => toggle(cellKey)} className={cn('flex h-9 items-center justify-center gap-1 rounded-lg text-[11px] font-bold', look.cls, on && 'shadow-[inset_0_0_0_2px_#000]')}>
              {cell.status === 'completed' ? <Check size={14} strokeWidth={3} /> : cell.blocked ? <Lock size={12} /> : null}{look.label}
            </button>
          }))}
        </div>)}
        {!learners.length ? <p className="p-6 text-center text-sm text-gray-500">No learners match.</p> : null}
      </div>
    </div>
    {selected.size ? <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-[#0f0f10] p-2.5 text-white shadow-xl">
      <span className="px-2 text-sm font-bold">{selected.size} selected</span>
      <label className="flex min-w-[220px] flex-1"><span className="sr-only">Note for the record</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for the record (optional)" className="h-9 w-full rounded-lg bg-white/10 px-3 text-sm text-white placeholder:text-white/50" /></label>
      <button type="button" onClick={() => void apply('completed')} disabled={Boolean(saving)} className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">{saving === 'completed' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Mark done</button>
      <button type="button" onClick={() => void apply('canceled')} disabled={Boolean(saving)} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold disabled:opacity-50">{saving === 'canceled' ? <Loader2 size={14} className="animate-spin" /> : null}Excuse</button>
      <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white"><X size={16} /></button>
    </div> : null}
  </div>
}

function phasePercent(phase: any, learners: any[]) {
  const cells = learners.flatMap((learner) => phase.objectives.map((objective: any) => learner.cells?.[objective.objective_uuid]).filter(Boolean))
  return cells.length ? Math.round(cells.filter((cell: any) => cell.status === 'completed').length * 100 / cells.length) : 0
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', cls)} />{label}</span>
}
