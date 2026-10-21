'use client'

import React from 'react'
import useSWR from 'swr'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  getGoalCoachSuggestions, goalSuggestionsKey,
  type GoalSuggestionRun, type HubEditObjectState, type HubGoalDetailsChange, type HubProposedStage, type HubProposedStep, type HubStageChange, type HubStepChange,
} from '@services/hub/advisor'
import type { Goal } from '@services/goals/types'

/** Which session a suggestion came from, and whether that session is still going. */
type Source = { runUuid: string; active: boolean }
export type PendingStage = Source & { stage: HubProposedStage; position: number; recovered?: HubEditObjectState }
export type PendingStep = Source & { step: HubProposedStep; stageUuid: string; recovered?: HubEditObjectState }
export type PendingStepChange = Source & { change: HubStepChange }
export type PendingStageChange = Source & { change: HubStageChange }
export type PendingGoalChange = Source & { change: HubGoalDetailsChange }
export type SuggestionKind = 'stages' | 'steps' | 'changes'

const EMPTY: GoalSuggestionRun[] = []

/** An id for a queued session event; ``crypto.randomUUID`` is missing on plain-http hosts. */
export const continuationId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * Coach's suggestions waiting on this goal, from the session running now or one that has ended.
 * They are read from the server, refetched as Coach's session moves on.
 */
export function useGoalSuggestions(goalUuid: string, token?: string) {
  const hub = useHub()
  const org = useOrg() as { id?: number } | null
  const run = hub?.editRun
  // A new turn of Coach's session on this goal adds events; fetch again when it does.
  const live = run && run.scope.target_uuid === goalUuid ? `${run.run_uuid}:${run.status}:${run.events.length}` : ''
  const { data, mutate } = useSWR(org?.id && token && goalUuid ? [goalSuggestionsKey(org.id, goalUuid), live] : null, () => getGoalCoachSuggestions(org!.id!, goalUuid, token!), { revalidateOnFocus: false })
  return { runs: data?.runs || EMPTY, refresh: mutate }
}

/** How many suggestions are waiting across these sessions. */
export function suggestionCount(runs: GoalSuggestionRun[]) {
  return runs.reduce((total, run) => total + run.operations.reduce((sum, operation) => sum + (
    operation.type === 'add_goal_stages' ? operation.stages.length : operation.type === 'add_goal_steps' ? operation.steps.length : 'changes' in operation ? operation.changes.length : 0
  ), 0), 0)
}

/** The active Coach session on this goal, if there is one. */
export function useGoalSession(goalUuid: string) {
  const run = useHub()?.editRun
  return run?.status === 'active' && run.scope.kind === 'goal' && run.scope.target_uuid === goalUuid ? run : null
}

/**
 * Coach's suggestions for this goal, placed where they belong: new stages and steps as quiet
 * lines, changes on the rows they change. Each shows until the learner adds or drops it; when
 * the last of a kind from the running session is settled, Coach is told so it can carry on.
 */
export function useGoalProposals(goal: Goal, token?: string) {
  const hub = useHub()
  const { runs, refresh } = useGoalSuggestions(goal.goal_uuid, token)
  const session = useGoalSession(goal.goal_uuid)
  const [settled, setSettled] = React.useState<Set<string>>(() => new Set())
  React.useEffect(() => setSettled(new Set()), [goal.goal_uuid])

  const placed = React.useMemo(() => {
    const stages: PendingStage[] = [], steps: PendingStep[] = [], stepChanges: PendingStepChange[] = [], stageChanges: PendingStageChange[] = [], goalChanges: PendingGoalChange[] = []
    for (const run of runs) {
      const source = { runUuid: run.run_uuid, active: run.active }
      const recovered = (key: string) => run.objects.find((item) => item.object_key === key)
      for (const operation of run.operations) {
        if (operation.type === 'add_goal_stages') {
          operation.stages.forEach((stage) => { if (!settled.has(stage.local_id)) stages.push({ ...source, stage, position: goal.stages.length + stages.length, recovered: recovered(stage.local_id) }) })
        } else if (operation.type === 'add_goal_steps') {
          operation.steps.forEach((step) => {
            if (settled.has(step.local_id)) return
            const saved = recovered(step.local_id)
            const named = goal.stages.find((stage) => stage.title.trim().toLowerCase() === step.stage_title.trim().toLowerCase())
            const stageUuid = saved && typeof saved.current_fields.stage_uuid === 'string' ? saved.current_fields.stage_uuid : named?.stage_uuid ?? goal.stages[0]?.stage_uuid ?? ''
            steps.push({ ...source, step, stageUuid, recovered: saved })
          })
        } else if (operation.type === 'change_goal_steps') {
          operation.changes.forEach((change) => { if (!settled.has(change.local_id)) stepChanges.push({ ...source, change }) })
        } else if (operation.type === 'change_goal_stages') {
          operation.changes.forEach((change) => { if (!settled.has(change.local_id)) stageChanges.push({ ...source, change }) })
        } else if (operation.type === 'set_goal_details') {
          operation.changes.forEach((change) => { if (!settled.has(change.local_id)) goalChanges.push({ ...source, change }) })
        }
      }
    }
    return { stages, steps, stepChanges, stageChanges, goalChanges }
  }, [goal.stages, runs, settled])

  const count = placed.stages.length + placed.steps.length + placed.stepChanges.length + placed.stageChanges.length + placed.goalChanges.length

  /** The learner added or dropped one suggestion; ``decision`` says what they did, for Coach. */
  const settle = (item: Source, localId: string, kind: SuggestionKind, decision: string) => {
    const next = new Set(settled).add(localId)
    setSettled(next)
    const run = hub?.editRun
    if (!item.active || !run || run.status !== 'active' || run.run_uuid !== item.runUuid) { void refresh(); return }
    const left = kind === 'stages' ? placed.stages : kind === 'steps' ? placed.steps : [...placed.stepChanges, ...placed.stageChanges, ...placed.goalChanges]
    const remaining = left.filter((other) => other.runUuid === item.runUuid && !next.has('stage' in other ? other.stage.local_id : 'step' in other ? other.step.local_id : other.change.local_id))
    if (remaining.length) return
    const noun = kind === 'changes' ? 'suggested changes' : `proposed ${kind}`
    hub?.enqueueEditContinuation({ id: continuationId(), conversationUuid: run.conversation_uuid, runUuid: run.run_uuid, content: `[[hub-session-event]] You finished reviewing the ${noun}\n${decision}\nAll ${noun} have now been reviewed. Continue working toward our editing goal.` })
  }

  return { session, count, ...placed, settle }
}
