'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { CalendarCheck, Check, ChevronRight, Loader2, Lock, Search, X } from 'lucide-react'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalAdminApi, matrixKey, type AssignmentMatrix, type MatrixColumn, type MatrixLearner } from '@services/goals/admin'
import type { StepStatus } from '@services/goals/types'
import { cn } from '@/lib/utils'
import RequirementEvidenceExport from './RequirementEvidenceExport'
import { EmptyState, Legend, PageLoader, personName, reviewHref } from './ui'

const LOOK: Record<string, { cls: string; label: string }> = {
  completed: { cls: 'bg-green-100 text-green-700', label: '' },
  submitted: { cls: 'bg-blue-100 text-blue-700', label: 'Review' },
  changes_requested: { cls: 'bg-amber-100 text-amber-800', label: 'Sent back' },
  in_progress: { cls: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200', label: 'Started' },
  excused: { cls: 'bg-gray-100 text-gray-500', label: 'Excused' },
  not_started: { cls: 'bg-white text-gray-400 ring-1 ring-inset ring-gray-200', label: '' },
}

type Stage = AssignmentMatrix['stages'][number]
const cellKey = (learner: MatrixLearner, column: MatrixColumn) => `${learner.goal_uuid}|${column.template_key}`
const finished = (status?: StepStatus) => status === 'completed' || status === 'excused' || status === 'submitted'

/** Learners × steps for one assignment. Select cells or a whole column (an event's attendance, say) and mark them at once. */
export default function CohortMatrix({ orgslug, orgId, token, assignmentUuid }: { orgslug: string; orgId: number; token?: string; assignmentUuid: string }) {
  const { data, isLoading, mutate } = useSWR(orgId && token ? matrixKey(assignmentUuid, orgId) : null, () => goalAdminApi.matrix(orgId, assignmentUuid, token), { revalidateOnFocus: false })
  const [closed, setClosed] = React.useState<Record<string, boolean>>({})
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [query, setQuery] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState<StepStatus | null>(null)
  React.useEffect(() => { setSelected(new Set()) }, [assignmentUuid])
  if (isLoading || !data) return <PageLoader />

  const stages = data.stages
  const all = data.learners
  const learners = all.filter((learner) => personName(learner).toLowerCase().includes(query.trim().toLowerCase()))
  const columnKeys = (column: MatrixColumn) => learners.filter((learner) => learner.cells[column.template_key] && !finished(learner.cells[column.template_key].status)).map((learner) => cellKey(learner, column))
  const toggle = (key: string) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const toggleColumn = (column: MatrixColumn) => {
    const keys = columnKeys(column)
    const allOn = keys.length > 0 && keys.every((key) => selected.has(key))
    setSelected((current) => { const next = new Set(current); keys.forEach((key) => allOn ? next.delete(key) : next.add(key)); return next })
  }
  const selectedTypes = new Set(Array.from(selected).map((key) => stages.flatMap((stage) => stage.steps).find((column) => column.template_key === key.split('|')[1])?.type))
  const attendance = selectedTypes.size === 1 && selectedTypes.has('event')
  const apply = async (status: StepStatus) => {
    const byStep = new Map<string, string[]>()
    selected.forEach((key) => { const [goalUuid, templateKey] = key.split('|'); byStep.set(templateKey, [...(byStep.get(templateKey) || []), goalUuid]) })
    setSaving(status)
    let updated = 0, skipped = 0
    try {
      for (const [templateKey, goalUuids] of byStep) {
        const results = await goalAdminApi.updateProgress(orgId, { template_key: templateKey, assignment_uuid: assignmentUuid, goal_uuids: goalUuids, status, staff_note: note.trim() || undefined }, token)
        updated += results.filter((item) => item.status === status).length
        skipped += results.filter((item) => item.status === 'skipped').length
      }
      toast.success(`${updated} ${status === 'completed' ? attendance ? 'marked attended' : 'marked done' : 'excused'}${skipped ? `; ${skipped} skipped` : ''}.`)
      setSelected(new Set()); setNote('')
      await mutate()
    } catch (error: any) { toast.error(error?.message || 'Could not update these steps.') } finally { setSaving(null) }
  }

  if (!stages.length) return <EmptyState title="This template has no steps" />
  const width = (stage: Stage) => closed[stage.stage_key] ? 1 : Math.max(stage.steps.length, 1)
  const tracks = ['200px', ...stages.flatMap((stage) => closed[stage.stage_key] || !stage.steps.length ? ['104px'] : stage.steps.map(() => 'minmax(84px,170px)'))]
  const grid = { gridTemplateColumns: tracks.join(' ') }
  const minWidth = 200 + stages.reduce((sum, stage) => sum + (closed[stage.stage_key] || !stage.steps.length ? 104 : stage.steps.length * 88), 0)
  const percent = (stage: Stage) => { const cells = all.flatMap((learner) => stage.steps.map((column) => learner.cells[column.template_key]).filter(Boolean)); return cells.length ? Math.round(cells.filter((cell) => cell.status === 'completed').length * 100 / cells.length) : 0 }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative flex items-center"><span className="sr-only">Search learners</span><Search size={14} className="absolute left-2.5 text-gray-400" /><input aria-label="Search learners" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${all.length} learners`} className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px]" /></label>
      <span className="flex-1" />
      <RequirementEvidenceExport orgId={orgId} token={token} scope={{ assignment_uuid: assignmentUuid, user_ids: learners.filter((learner) => learner.id > 0).map((learner) => learner.id) }} />
      <span className="flex flex-wrap gap-3 text-xs text-gray-600"><Legend cls="bg-green-100" label="Done" /><Legend cls="bg-blue-100" label="To review" /><Legend cls="bg-amber-100" label="Sent back" /><Legend cls="bg-gray-100" label="Excused" /></span>
    </div>
    <p className="text-xs text-gray-500">Click a step to select everyone who hasn’t finished it (an event’s attendance, for example), or pick cells one by one. Blue cells open the review.</p>
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white nice-shadow"><div style={{ minWidth }}>
      <div className="grid gap-1 px-3 pt-2" style={grid}>
        <span />
        {stages.map((stage, index) => {
          const isClosed = Boolean(closed[stage.stage_key])
          return <button key={stage.stage_key} type="button" aria-expanded={!isClosed} onClick={() => setClosed({ ...closed, [stage.stage_key]: !isClosed })} className={cn('flex min-w-0 items-center gap-1.5 rounded-t-lg px-2.5 py-2 text-left', index % 2 ? 'bg-gray-50' : 'bg-gray-100')} style={{ gridColumn: `span ${width(stage)}` }}>
            <ChevronRight size={12} className={cn('shrink-0 text-gray-500 transition', !isClosed && 'rotate-90')} />
            <span className="truncate text-xs font-black text-gray-900">{stage.title}</span>
            {!isClosed ? <span className="shrink-0 text-[11px] text-gray-500">{stage.steps.length} steps</span> : null}
          </button>
        })}
      </div>
      <div className="grid items-end gap-1 border-b border-gray-100 px-3 pb-2 pt-1" style={grid}>
        <span className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Learner</span>
        {stages.flatMap((stage) => closed[stage.stage_key] || !stage.steps.length ? [<span key={stage.stage_key} className="px-1.5 pb-1 text-[11px] text-gray-500">{percent(stage)}% done</span>] : stage.steps.map((column) => {
          const keys = columnKeys(column)
          const on = keys.length > 0 && keys.every((key) => selected.has(key))
          const Icon = stepDefinition(column.type).icon
          return <button key={column.template_key} type="button" aria-pressed={on} onClick={() => toggleColumn(column)} title={column.title} aria-label={`Select everyone not done with ${column.title}`} className={cn('flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border-2 p-1.5 text-left', on ? 'border-black bg-gray-50' : 'border-transparent hover:bg-gray-50')}>
            <Icon size={12} className="text-gray-500" aria-hidden="true" />
            <span className="line-clamp-2 text-xs font-bold leading-tight text-gray-900">{column.title}</span>
            <span className="text-[11px] text-gray-500">{column.aggregate.completed_count}/{column.aggregate.learner_count}{column.aggregate.review_count ? ` · ${column.aggregate.review_count} to review` : ''}</span>
          </button>
        }))}
      </div>
      {learners.map((learner) => <div key={learner.goal_uuid} className="grid items-center gap-1 border-b border-gray-50 px-3 py-1" style={grid}>
        <span className="flex min-w-0 items-center gap-2 pr-2">
          <Link href={getUriWithOrg(orgslug, routePaths.org.dash.livePlan(learner.goal_uuid))} className="truncate text-[13px] font-bold text-gray-900 hover:text-blue-700">{personName(learner)}</Link>
          {learner.custom_steps.length ? <span title={learner.custom_steps.map((item) => item.title).join(', ')} className="shrink-0 rounded-full bg-blue-50 px-1.5 text-[10px] font-bold text-blue-700">+{learner.custom_steps.length}</span> : null}
          {learner.status === 'pending' ? <span className="shrink-0 text-[10px] text-gray-400">invited</span> : null}
        </span>
        {stages.flatMap((stage) => {
          if (closed[stage.stage_key] || !stage.steps.length) return [<span key={stage.stage_key} className="flex h-9 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-700">{stage.steps.filter((column) => learner.cells[column.template_key]?.status === 'completed').length} of {stage.steps.length}</span>]
          return stage.steps.map((column) => {
            const cell = learner.cells[column.template_key]
            if (!cell) return <span key={column.template_key} className="h-9 rounded-lg bg-gray-50" title="Not in this learner’s goal" />
            const look = LOOK[cell.status] || LOOK.not_started
            const label = `${personName(learner)}, ${column.title}`
            if (cell.status === 'submitted') return <Link key={column.template_key} aria-label={`Review ${label}`} href={getUriWithOrg(orgslug, reviewHref({ assignment: assignmentUuid, stepKey: column.template_key, focus: cell.step_uuid }))} className={cn('flex h-9 items-center justify-center rounded-lg text-[11px] font-bold hover:ring-2 hover:ring-blue-300', look.cls)}>Review</Link>
            const key = cellKey(learner, column)
            const on = selected.has(key)
            const done = cell.status === 'completed' || cell.status === 'excused'
            return <button key={column.template_key} type="button" aria-label={label} aria-pressed={on} disabled={done} onClick={() => toggle(key)} className={cn('flex h-9 items-center justify-center gap-1 rounded-lg text-[11px] font-bold', look.cls, on && 'shadow-[inset_0_0_0_2px_#000]')}>
              {cell.status === 'completed' ? <Check size={14} strokeWidth={3} /> : cell.locked || cell.held ? <Lock size={12} /> : null}{look.label}
            </button>
          })
        })}
      </div>)}
      {!learners.length ? <p className="p-6 text-center text-sm text-gray-500">No learners match.</p> : null}
    </div></div>
    {selected.size ? <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-[#0f0f10] p-2.5 text-white shadow-xl">
      <span className="px-2 text-sm font-bold">{selected.size} selected</span>
      <label className="flex min-w-[220px] flex-1"><span className="sr-only">Note for the record</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for the record (optional)" className="h-9 w-full rounded-lg bg-white/10 px-3 text-sm text-white placeholder:text-white/50" /></label>
      <button type="button" onClick={() => void apply('completed')} disabled={Boolean(saving)} className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">{saving === 'completed' ? <Loader2 size={14} className="animate-spin" /> : attendance ? <CalendarCheck size={14} /> : <Check size={14} />}{attendance ? 'Mark attended' : 'Mark done'}</button>
      <button type="button" onClick={() => void apply('excused')} disabled={Boolean(saving)} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold disabled:opacity-50">{saving === 'excused' ? <Loader2 size={14} className="animate-spin" /> : null}Excuse</button>
      <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white"><X size={16} /></button>
    </div> : null}
  </div>
}
