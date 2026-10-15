'use client'

import React from 'react'
import { useHub } from '@components/Hub/HubContext'
import type { HubEditObjectState, HubProposedStage, HubProposedStep } from '@services/hub/advisor'
import type { Goal } from '@services/goals/types'

export type PendingStage = { stage: HubProposedStage; position: number; recovered?: HubEditObjectState }
export type PendingStep = { step: HubProposedStep; stageUuid: string; recovered?: HubEditObjectState }

/**
 * Coach's proposed stages and steps for this goal while a Coach run is editing it. Each shows
 * once until the learner saves or cancels it; when the last of a batch is settled, Coach is told
 * so it can carry on.
 */
export function useGoalProposals(goal: Goal) {
  const hub = useHub()
  const [stages, setStages] = React.useState<PendingStage[]>([])
  const [steps, setSteps] = React.useState<PendingStep[]>([])
  const handled = React.useRef(new Set<string>())
  const run = hub?.editRun
  const editing = run?.status === 'active' && run.scope.kind === 'goal' && run.scope.target_uuid === goal.goal_uuid
  const objects = run?.objects
  const operations = hub?.editOperations

  React.useEffect(() => {
    if (editing) return
    setStages([]); setSteps([]); handled.current.clear()
  }, [goal.goal_uuid, editing])

  React.useEffect(() => {
    if (!editing) return
    const fresh = (operations || []).filter((operation) => (operation.type === 'add_goal_stages' || operation.type === 'add_goal_steps') && !handled.current.has(operation.operation_id))
    if (!fresh.length) return
    fresh.forEach((operation) => handled.current.add(operation.operation_id))
    const settled = new Set((objects || []).filter((item) => item.status !== 'editing').map((item) => item.object_key))
    const recovered = (key: string) => objects?.find((item) => item.object_key === key && item.status === 'editing')
    const proposedStages = fresh.flatMap((operation) => operation.type === 'add_goal_stages' ? operation.stages : [])
    const proposedSteps = fresh.flatMap((operation) => operation.type === 'add_goal_steps' ? operation.steps : [])
    setStages((current) => {
      const known = new Set(current.map((item) => item.stage.local_id))
      return [...current, ...proposedStages.filter((stage) => !known.has(stage.local_id) && !settled.has(stage.local_id)).map((stage, index) => ({ stage, position: goal.stages.length + index, recovered: recovered(stage.local_id) }))]
    })
    setSteps((current) => {
      const known = new Set(current.map((item) => item.step.local_id))
      return [...current, ...proposedSteps.filter((step) => !known.has(step.local_id) && !settled.has(step.local_id)).map((step) => {
        const saved = recovered(step.local_id)
        const named = goal.stages.find((stage) => stage.title.trim().toLowerCase() === step.stage_title.trim().toLowerCase())
        const stageUuid = saved && typeof saved.current_fields.stage_uuid === 'string' ? saved.current_fields.stage_uuid : named?.stage_uuid ?? goal.stages[0]?.stage_uuid ?? ''
        return { step, stageUuid, recovered: saved }
      })]
    })
  }, [editing, goal.stages, objects, operations])

  const finish = (kind: 'stages' | 'steps', remaining: number, decision: string) => {
    if (!run || remaining) return
    hub?.enqueueEditContinuation({ id: crypto.randomUUID(), conversationUuid: run.conversation_uuid, runUuid: run.run_uuid, content: `[[hub-session-event]] You finished reviewing the proposed ${kind}\n${decision}\nAll proposed ${kind} have now been reviewed. Continue working toward our editing goal.` })
  }
  const settleStage = (localId: string, decision: string) => {
    const remaining = stages.filter((item) => item.stage.local_id !== localId)
    setStages(remaining)
    finish('stages', remaining.length, decision)
  }
  const settleStep = (localId: string, decision: string) => {
    const remaining = steps.filter((item) => item.step.local_id !== localId)
    setSteps(remaining)
    finish('steps', remaining.length, decision)
  }
  const moveStep = (localId: string, stageUuid: string) => setSteps((current) => current.map((item) => item.step.local_id === localId ? { ...item, stageUuid } : item))
  return { editing, stages, steps, settleStage, settleStep, moveStep }
}
