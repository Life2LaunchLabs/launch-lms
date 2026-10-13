'use client'

import { useState } from 'react'
import { ArrowRight, ChevronDown, ChevronsUp, ListChecks } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { HubEditObjectState, HubEditOperation, HubEditRun, HubEditRunEvent } from '@services/hub/advisor'

type EditRun = HubEditRun | null

/** A message-like record the timeline is placed against. */
type TimelineMessage = { role: string; createdAt?: string }

export function recoverHubEditOperations(run: EditRun): HubEditOperation[] {
  if (!run || run.status !== 'active') return []
  const stateByKey = new Map(run.objects.map((item) => [item.object_key, item]))
  return run.events.flatMap((event) => {
    const operation = event.payload?.operation
    if (!operation || typeof operation !== 'object' || !('type' in operation)) return []
    if (operation.type === 'set_new_plan_details' && stateByKey.get('new-plan')?.status !== 'editing' && stateByKey.has('new-plan')) return []
    if (operation.type === 'add_plan_objectives' && 'objectives' in operation && Array.isArray(operation.objectives)) {
      const objectives = operation.objectives.filter((objective: any) => !stateByKey.has(objective.local_id) || stateByKey.get(objective.local_id)?.status === 'editing')
      return objectives.length ? [{ ...operation, objectives } as HubEditOperation] : []
    }
    if (operation.type === 'add_plan_phases' && 'phases' in operation && Array.isArray(operation.phases)) {
      const phases = operation.phases.filter((phase: any) => !stateByKey.has(phase.local_id) || stateByKey.get(phase.local_id)?.status === 'editing')
      return phases.length ? [{ ...operation, phases } as HubEditOperation] : []
    }
    return [operation as HubEditOperation]
  })
}

export function mergePendingHubEditOperations(current: HubEditOperation[], incoming: HubEditOperation[], run: EditRun): HubEditOperation[] {
  if (run && run.status !== 'active') return []
  const stateByKey = new Map((run?.objects || []).map((item) => [item.object_key, item]))
  const pending = current.flatMap((operation) => {
    if (operation.type === 'set_new_plan_details') {
      const state = stateByKey.get('new-plan')
      return !state || state.status === 'editing' ? [operation] : []
    }
    if (operation.type === 'add_plan_phases') {
      const phases = operation.phases.filter((phase) => !stateByKey.has(phase.local_id) || stateByKey.get(phase.local_id)?.status === 'editing')
      return phases.length ? [{ ...operation, phases } as HubEditOperation] : []
    }
    if (operation.type === 'add_plan_objectives') {
      const objectives = operation.objectives.filter((objective) => !stateByKey.has(objective.local_id) || stateByKey.get(objective.local_id)?.status === 'editing')
      return objectives.length ? [{ ...operation, objectives } as HubEditOperation] : []
    }
    return []
  })
  const merged = new Map(pending.map((operation) => [operation.operation_id, operation]))
  for (const operation of incoming) {
    if (!merged.has(operation.operation_id)) merged.set(operation.operation_id, operation)
  }
  const next = [...merged.values()]
  return next.length === current.length && next.every((operation, index) => operation === current[index]) ? current : next
}

export function sessionEventLabel(content: string) {
  return content.match(/^\[\[hub-session-event\]\]\s+([^\n]+)/)?.[1] || ''
}

export type HubRunTimelineEntry = { id: string; kind: 'agent' | 'learner' | 'boundary'; events: HubEditRunEvent[]; createdAt: string }

function hubEventTarget(event: HubEditRunEvent, localId?: string) {
    if (localId && event.kind === 'objectives.proposed') return `hub-edit-objective-${localId}`
    if (localId && event.kind === 'phases.proposed') return `hub-edit-phase-${localId}`
    if (event.kind === 'plan.proposed') return 'hub-edit-new-plan'
    if (!event.object_uuid) return ''
    return event.object_type === 'phase' ? `plan-phase-${event.object_uuid}` : `hub-object-${event.object_uuid}`
}

export function buildHubRunTimeline(events: HubEditRunEvent[]): HubRunTimelineEntry[] {
  const entries: HubRunTimelineEntry[] = []
  for (const event of events) {
    if (['run.started', 'run.completed', 'run.cancelled', 'run.reopened'].includes(event.kind)) {
      entries.push({ id: event.event_uuid, kind: 'boundary', events: [event], createdAt: event.created_at })
      continue
    }
    const learnerEvent = event.kind.endsWith('.saved') || event.kind.endsWith('.cancelled') || event.kind === 'run.goal_updated'
    const previous = entries.at(-1)
    if (learnerEvent && previous?.kind === 'learner' && previous.events.at(-1)?.kind === event.kind) {
      previous.events.push(event)
      continue
    }
    if (!learnerEvent && previous?.kind === 'agent' && !previous.events.some((item) => item.kind.endsWith('.proposed'))) {
      previous.events.push(event)
      continue
    }
    entries.push({ id: event.event_uuid, kind: learnerEvent ? 'learner' : 'agent', events: [event], createdAt: event.created_at })
  }
  return entries
}

export function HubSessionBoundary({ event, run, onRestore }: { event: HubEditRunEvent; run: EditRun; onRestore: () => void }) {
  const terminal = event.kind === 'run.completed' || event.kind === 'run.cancelled'
  const scopeKind = String(event.payload?.scope_kind || run?.scope.kind || '')
  const rawGoal = String(event.payload?.goal || run?.goal || 'Focused work')
  const goal = /^\s*(create|edit|update|build)\b/i.test(rawGoal) ? rawGoal : `${scopeKind === 'new_plan' ? 'Create a plan' : 'Edit a plan'}: ${rawGoal}`
  const verb = event.kind === 'run.started' ? 'started session' : event.kind === 'run.reopened' ? 'reopened session' : 'ended session'
  return <div className="flex items-center gap-2 py-1 text-[10px] text-muted-foreground" aria-label={`${verb}: ${goal}`}>
    <span className="h-px flex-1 bg-border" />
    {terminal ? <button type="button" onClick={onRestore} className="group/boundary flex max-w-[80%] flex-col items-center rounded-lg px-3 py-1 text-center leading-4 transition hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"><span className="inline-flex items-center gap-1"><span className="group-hover/boundary:hidden">ended session</span><span className="hidden items-center gap-1 group-hover/boundary:inline-flex"><ChevronsUp size={11} />restore session</span></span><span className="truncate text-[11px] font-medium">{goal}</span></button> : <div className="max-w-[80%] text-center leading-4"><div>{verb}</div><div className="truncate text-[11px] font-medium">{goal}</div></div>}
    <span className="h-px flex-1 bg-border" />
  </div>
}

// eslint-disable-next-line no-unused-vars
export function HubEditActivity({ events, objects, onPoint, onFinish, pendingReviewCount = 0 }: { events: HubEditRunEvent[]; objects: HubEditObjectState[]; onPoint: (targetId: string) => void; onFinish?: () => void; pendingReviewCount?: number }) {
  const conclusion = events.find((event) => event.kind === 'run.conclusion_proposed')
  const [expanded, setExpanded] = useState(Boolean(conclusion))
  const details = events.flatMap((event) => {
    const operation = event.payload?.operation as { phases?: Array<{ local_id: string; name: string }>; objectives?: Array<{ local_id: string; title: string }> } | undefined
    if (operation?.phases) return operation.phases.map((phase) => { const state = objects.find((item) => item.object_key === phase.local_id); return { id: `${event.event_uuid}:${phase.local_id}`, label: `Proposed phase “${phase.name}”`, targetId: state?.object_uuid ? `plan-phase-${state.object_uuid}` : hubEventTarget(event, phase.local_id) } })
    if (operation?.objectives) return operation.objectives.map((objective) => { const state = objects.find((item) => item.object_key === objective.local_id); return { id: `${event.event_uuid}:${objective.local_id}`, label: `Proposed objective “${objective.title}”`, targetId: state?.object_uuid ? `hub-object-${state.object_uuid}` : hubEventTarget(event, objective.local_id) } })
    return [{ id: event.event_uuid, label: event.summary, targetId: hubEventTarget(event) }]
  })
  const summary = events.map((event) => event.summary.replace(/^Prepared/, 'Proposed')).join(' · ')
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="group/activity text-xs text-muted-foreground" aria-label="Hub editing activity">
    <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 hover:text-foreground"><ListChecks size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{summary}</span><ChevronDown size={13} className="shrink-0 opacity-0 transition group-hover/activity:opacity-100 group-open/activity:rotate-180 group-open/activity:opacity-100" /></summary>
    <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">{!conclusion ? details.map((detail) => <button key={detail.id} type="button" disabled={!detail.targetId} onClick={() => detail.targetId && onPoint(detail.targetId)} className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-[11px] enabled:hover:bg-muted enabled:hover:text-foreground"><span>{detail.label}</span>{detail.targetId ? <ArrowRight size={11} className="shrink-0" /> : null}</button>) : <div className="px-2 py-1"><p className="leading-5">{String(conclusion.payload?.operation && typeof conclusion.payload.operation === 'object' && 'summary' in conclusion.payload.operation ? conclusion.payload.operation.summary : conclusion.summary)}</p><Button type="button" size="sm" className="mt-2 h-8 text-xs" disabled={Boolean(pendingReviewCount)} onClick={onFinish}>Finish session</Button>{pendingReviewCount ? <p className="mt-1.5 text-[10px]">Review the remaining {pendingReviewCount} {pendingReviewCount === 1 ? 'object' : 'objects'} first.</p> : null}</div>}</div>
  </details>
}

// eslint-disable-next-line no-unused-vars
export function HubLearnerSessionEvent({ events, onPoint }: { events: HubEditRunEvent[]; onPoint: (targetId: string) => void }) {
  const first = events[0]
  const status = first.kind.endsWith('.cancelled') ? 'cancelled' : 'saved'
  const objectType = first.object_type || 'object'
  const label = first.kind === 'run.goal_updated'
    ? 'You updated the session goal'
    : `You ${status} ${events.length === 1 ? (first.object_label ? `“${first.object_label}”` : `1 ${objectType}`) : `${events.length} ${objectType}s`}`
  const targets = events.map((event) => ({ event, targetId: hubEventTarget(event) })).filter((item) => item.targetId)
  if (targets.length <= 1) return <button type="button" disabled={!targets.length} onClick={() => targets[0]?.targetId && onPoint(targets[0].targetId)} className="w-fit text-left text-[11px] italic text-muted-foreground enabled:hover:text-foreground">{label}</button>
  return <details className="group/session-event w-fit text-[11px] italic text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground"><span>{label}</span><ChevronDown size={11} className="opacity-0 transition group-hover/session-event:opacity-100 group-open/session-event:rotate-180 group-open/session-event:opacity-100" /></summary><div className="ml-2 mt-1 space-y-1 border-l border-border pl-2">{targets.map(({ event, targetId }) => <button key={event.event_uuid} type="button" onClick={() => onPoint(targetId)} className="block hover:text-foreground">{event.object_label || event.summary}</button>)}</div></details>
}

export function placeHubRunTimeline(entries: HubRunTimelineEntry[], messages: TimelineMessage[]) {
  const slots = new Map<number, HubRunTimelineEntry[]>()
  const messageTimes = messages.map((message) => message.createdAt ? new Date(message.createdAt).getTime() : Number.NaN)
  for (const entry of entries) {
    const eventTime = new Date(entry.createdAt).getTime()
    let slot = messageTimes.findIndex((time) => Number.isFinite(time) && time > eventTime)
    if (slot < 0) slot = messages.length
    if (entry.kind === 'agent') {
      let closest = -1, distance = 30_000
      messages.forEach((message, index) => {
        if (message.role !== 'assistant' || !Number.isFinite(messageTimes[index])) return
        const candidate = Math.abs(messageTimes[index] - eventTime)
        if (candidate < distance) { closest = index; distance = candidate }
      })
      if (closest >= 0) slot = closest + 1
    }
    slots.set(slot, [...(slots.get(slot) || []), entry])
  }
  return slots
}
