'use client'

import React from 'react'
import { PartyPopper } from 'lucide-react'
import { Button } from '@components/ui/button'
import { planVars } from '@components/Goals/planColors'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import type { Goal } from '@services/goals/types'
import { GoalMark, type GoalBadge } from './GoalHeader'

/** Shown once when a learner's goal is finished: celebrate, then the goal moves to Finished. */
export default function GoalComplete({ goal, badge, color, token, onDone, onView }: {
  goal: Goal
  badge?: GoalBadge
  color: string
  token?: string
  onDone: () => void
  onView: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const steps = goal.progress.done
  const finish = async (next: () => void) => {
    setBusy(true)
    // Seen is best effort: if it fails, the learner simply sees this once more.
    try { await goalLifecycleApi.celebrated(goal.goal_uuid, token) } catch { /* noop */ }
    finally { setBusy(false); next() }
  }
  return <div data-plan="" style={planVars(color)} className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-6 rounded-3xl bg-[var(--plan-deep)] px-6 py-12 text-center text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)]" role="status">
    <PartyPopper size={44} aria-hidden="true" />
    <GoalMark badge={badge} />
    <div>
      <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">Goal complete</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{goal.title}</h2>
      <p className="mt-3 text-sm font-semibold opacity-90">
        You finished {steps ? `${steps === goal.progress.total ? 'all ' : ''}${steps} ${steps === 1 ? 'step' : 'steps'}` : 'this goal'}{badge ? ` and earned ${badge.name || 'your badge'}` : ''}. Nice work.
      </p>
    </div>
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Button type="button" variant="surface" disabled={busy} onClick={() => void finish(onDone)}>Back to my goals</Button>
      <Button type="button" variant="ghost" className="text-[var(--plan-deep-ink)]" disabled={busy} onClick={() => void finish(onView)}>Look back at this goal</Button>
    </div>
    <p className="text-xs opacity-75">You can find it any time under Finished on your goals page.</p>
  </div>
}
