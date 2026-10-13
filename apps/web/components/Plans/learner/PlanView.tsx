'use client'

import React from 'react'
import { Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useHub } from '@components/Hub/HubContext'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { cn } from '@/lib/utils'
import { SelectedStepBody, StepStack, stepState, type StepItem } from './StepStack'
import { planVars } from './planColors'
import PlanHeaderActions from './PlanHeaderActions'
import { PlanCarousel, PlanHeaderCard } from './PlanHeader'

type PlanSummary = { plan_uuid: string; slug: string; name: string; progress_percent?: number }
type PlanViewProps = {
  orgslug: string; detail: any; token?: string; refresh: () => Promise<unknown>; onBack: () => void; plans: PlanSummary[]
  // eslint-disable-next-line no-unused-vars
  getPlanColor: (planUuid?: string) => string
  // eslint-disable-next-line no-unused-vars
  choose: (plan: any) => void
  onEdit?: () => void
  // eslint-disable-next-line no-unused-vars
  renderObjective: (item: StepItem, close: () => void) => React.ReactNode
}

function chaptersOf(detail: any) {
  const plan = { plan_uuid: detail.plan_uuid, slug: detail.slug, name: detail.name }
  const withPlan = (items: any[]) => items.map((item) => ({ ...item, plan, is_mine: detail.is_mine, subject: detail.subject }))
  const chapters = (detail.phases || []).map((phase: any) => ({ key: phase.phase_uuid, title: phase.name, items: withPlan(phase.objectives || []) }))
  const loose = (detail.objectives || []).filter((item: any) => !item.phase_uuid)
  if (loose.length) chapters.push({ key: 'loose', title: chapters.length ? 'More steps' : 'Steps', items: withPlan(loose) })
  return chapters.filter((chapter: any) => chapter.items.length)
}

/** A learner's plan: its header among their other plans, then the path of steps, opened at the next one. */
export default function PlanView({ orgslug, detail, token, refresh, onBack, plans, getPlanColor, choose, onEdit, renderObjective }: PlanViewProps) {
  const router = useRouter()
  const hub = useHub()
  const chapters = React.useMemo(() => chaptersOf(detail), [detail])
  const steps: StepItem[] = chapters.flatMap((chapter: any) => chapter.items)
  const next = steps.find((item) => stepState(item) === 'open' && item.progress?.status !== 'completed') || steps.find((item) => stepState(item) !== 'done')
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const selectedUuid = selected || next?.objective_uuid || ''
  const done = steps.filter((item) => item.progress?.status === 'completed').length
  const badge = detail.source_badge
  const nextUuid = next?.objective_uuid

  React.useEffect(() => { setSelected(''); setOpen(null) }, [detail.plan_uuid])
  // Open at the step to do next, like a path that starts where you left off.
  React.useEffect(() => {
    if (!nextUuid) return
    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`step-${nextUuid}`)
      const rect = node?.getBoundingClientRect()
      if (node && rect && (rect.top < 0 || rect.bottom > window.innerHeight)) node.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [detail.plan_uuid, nextUuid])

  const goTo = (objectiveUuid: string) => { setSelected(objectiveUuid); document.getElementById(`step-${objectiveUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const start = (item: StepItem) => item.activity_id ? router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(detail.slug)}/objectives/${item.objective_uuid}/activity`)) : setOpen(item)
  const ask = hub ? (item: StepItem) => hub.open({ prompt: `Help me with “${item.title}” in my plan “${detail.name}”.` }) : undefined

  return <div data-plan="" style={planVars(getPlanColor(detail.plan_uuid))} className="flex flex-col gap-8">
    <PlanCarousel plans={plans} activeUuid={detail.plan_uuid} getPlanColor={getPlanColor} choose={choose}>
      <PlanHeaderCard detail={detail} done={done} total={steps.length} actions={<PlanHeaderActions orgslug={orgslug} detail={detail} token={token} refresh={refresh} onBack={onBack} onEdit={onEdit} />} />
    </PlanCarousel>
    {chapters.length ? chapters.map((chapter: any) => {
      const chapterDone = chapter.items.filter((item: any) => item.progress?.status === 'completed').length
      const waiting = chapter.items.every((item: any) => stepState(item) === 'not_ready')
      return <section key={chapter.key} aria-label={chapter.title} className="flex flex-col gap-4">
        {chapters.length > 1 || (chapter.title !== 'Steps' && chapter.title !== detail.name) ? <div className={cn('flex items-baseline justify-between gap-3 rounded-2xl border-2 px-4 py-3', waiting ? 'border-border text-muted-foreground' : 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_12%,hsl(var(--card)))]')}>
          <h2 className="text-lg font-extrabold tracking-tight">{chapter.title}</h2>
          <span className="shrink-0 text-xs font-bold text-muted-foreground">{chapterDone} of {chapter.items.length}</span>
        </div> : null}
        <StepStack items={chapter.items} colorFor={() => getPlanColor(detail.plan_uuid)} selectedUuid={selectedUuid} currentUuid={nextUuid} onSelect={(item) => setSelected(item.objective_uuid)} renderSelected={(item, state) => <SelectedStepBody item={item} state={state} onStart={() => start(item)} onGoTo={goTo} onAsk={ask ? () => ask(item) : undefined} />} />
      </section>
    }) : <div className="rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
      <p className="font-bold">No steps yet</p>
      {onEdit ? <Button type="button" variant="plan" className="mt-4" onClick={onEdit}>Add steps</Button> : null}
    </div>}
    {steps.length ? <div className="flex items-center gap-4">
      <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', done === steps.length ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)]' : 'bg-muted text-muted-foreground')} aria-hidden="true"><Trophy size={24} /></span>
      <div>
        <p className="font-extrabold">{done === steps.length ? 'All steps done' : 'Your goal'}</p>
        <p className="text-sm text-muted-foreground">{badge ? `${badge.name} badge` : 'Every step brings you closer.'}</p>
        {done === steps.length && badge ? <Button variant="link" asChild className="h-auto p-0 text-xs"><a href={getUriWithOrg(orgslug, '/portfolio/badges')}>View earned badges</a></Button> : null}
      </div>
    </div> : null}
    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}
