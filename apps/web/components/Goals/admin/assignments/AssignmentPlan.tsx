'use client'

import React from 'react'
import GoalPath from '@components/Goals/learner/GoalPath'
import { GoalChatProvider } from '@components/Goals/chat/GoalChat'
import { PLAN_COLORS } from '@components/Goals/planColors'
import type { AssignmentMatrix } from '@services/goals/admin'
import { cohortAggregates, cohortPlan, dayOf, firstToDo, upcomingStep } from '@services/goals/cohort'
import StepTodos, { type TodoContext } from './StepTodos'

/**
 * The assignment's plan: the same stages and steps its learners see, each step counted across
 * them, with what's left for staff under it. The open step shows its to-dos in place of its
 * card. Steps' chat buttons come from the assignment's staff chat once the API serves it.
 */
export default function AssignmentPlan({ matrix, ctx, viewerUserId }: { matrix: AssignmentMatrix; ctx: Omit<TodoContext, 'learners' | 'now' | 'status'>; viewerUserId?: number }) {
  const now = React.useMemo(() => new Date(), [])
  const today = dayOf(now)
  const plan = React.useMemo(() => cohortPlan(matrix, today), [matrix, today])
  const aggregates = React.useMemo(() => cohortAggregates(matrix), [matrix])
  const columns = React.useMemo(() => new Map(matrix.stages.flatMap((stage) => stage.steps).map((column) => [column.template_key, column])), [matrix])
  const upcoming = upcomingStep(matrix)?.template_key
  const [selected, setSelected] = React.useState(() => firstToDo(matrix, now))
  const summary = matrix.assignment
  const full: TodoContext = { ...ctx, learners: matrix.learners, now, status: summary.status }
  const todos = (key: string, open: boolean) => {
    const column = columns.get(key)
    return column ? <StepTodos column={column} ctx={full} upcoming={key === upcoming} full={open} onOpen={() => setSelected(key)} /> : null
  }
  return <GoalChatProvider scope={{ assignment: { orgId: ctx.orgId, assignment_uuid: summary.assignment_uuid, title: summary.template_title }, audience: 'staff' }} token={ctx.token} orgslug={ctx.orgslug}>
    <GoalPath goal={plan} color={PLAN_COLORS[0]} perspective="cohort" viewer={{ orgslug: ctx.orgslug, token: ctx.token, viewerUserId }}
      selectedUuid={selected} onSelect={setSelected} aggregates={aggregates}
      rowExtra={(step, row) => row.selected ? null : todos(step.step_uuid, false)}
      stepBody={(step) => todos(step.step_uuid, true)} />
  </GoalChatProvider>
}
