'use client'

import React from 'react'
import { PartyPopper } from 'lucide-react'
import { Button } from '@components/ui/button'
import { planningApi } from '@services/planning/planning'
import { planVars } from './planColors'
import { PlanMark } from './PlanHeader'

/** Shown once when a learner's plan is finished: celebrate, then the plan moves to Completed. */
export default function PlanComplete({ detail, color, token, onDone, onView }: {
  detail: any
  color: string
  token?: string
  onDone: () => void
  onView: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const badge = detail.badge || detail.source_badge
  const steps = (detail.objectives || detail.phases?.flatMap((phase: any) => phase.objectives || []) || [])
    .filter((item: any) => item.progress?.status === 'completed').length
  const finish = async (next: () => void) => {
    setBusy(true)
    // Seen is best effort: if it fails, the learner simply sees this once more.
    try { await planningApi.celebrated(detail.slug, token) } catch { /* noop */ }
    finally { setBusy(false); next() }
  }
  return <div data-plan="" style={planVars(color)} className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-6 rounded-3xl bg-[var(--plan-deep)] px-6 py-12 text-center text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)]" role="status">
    <PartyPopper size={44} aria-hidden="true" />
    <PlanMark badge={badge} />
    <div>
      <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">Plan complete</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{detail.name}</h2>
      <p className="mt-3 text-sm font-semibold opacity-90">
        You finished {steps ? `all ${steps} ${steps === 1 ? 'step' : 'steps'}` : 'every step'}{badge ? ` and earned ${badge.name || 'your badge'}` : ''}. Nice work.
      </p>
    </div>
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Button type="button" variant="surface" disabled={busy} onClick={() => void finish(onDone)}>Back to my plans</Button>
      <Button type="button" variant="ghost" className="text-[var(--plan-deep-ink)]" disabled={busy} onClick={() => void finish(onView)}>Look back at this plan</Button>
    </div>
    <p className="text-xs opacity-75">You can find it any time under Completed on your plans page.</p>
  </div>
}
