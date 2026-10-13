'use client'

import React from 'react'
import { Award, Flag, Pencil, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { cn } from '@/lib/utils'
import { SelectedStepBody, StepStack, type StepItem } from './StepStack'
import { planTone } from './planColors'
import PlanHeaderActions from './PlanHeaderActions'

const RULES: Record<string, string> = { any: 'Any order', in_order: 'Steps open in order', by_chapter: 'Chapters open in turn' }
type PlanSummary = { plan_uuid: string; slug: string; name: string }
type PlanViewProps = {
  orgslug: string; detail: any; token?: string; refresh: () => Promise<unknown>; onBack: () => void; plans: PlanSummary[]
  // eslint-disable-next-line no-unused-vars
  getPlanColor: (planUuid?: string) => string
  // eslint-disable-next-line no-unused-vars
  choose: (plan: any) => void
  onEdit?: () => void
  editDetails?: boolean; onHeaderEditFinished?: () => void
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

export default function PlanView({ orgslug, detail, token, refresh, onBack, plans, getPlanColor, choose, onEdit, editDetails, onHeaderEditFinished, renderObjective }: PlanViewProps) {
  const router = useRouter()
  const chapters = React.useMemo(() => chaptersOf(detail), [detail])
  const steps: StepItem[] = chapters.flatMap((chapter: any) => chapter.items)
  const next = steps.find((item) => item.availability?.state === 'open' && item.progress?.status !== 'completed') || steps.find((item) => item.progress?.status !== 'completed')
  const [selected, setSelected] = React.useState('')
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const selectedUuid = selected || next?.objective_uuid || ''
  const tone = planTone(getPlanColor(detail.plan_uuid))
  React.useEffect(() => { setSelected(''); setAboutOpen(false); setOpen(null) }, [detail.plan_uuid])
  const done = steps.filter((item) => item.progress?.status === 'completed').length
  const percent = steps.length ? Math.round((done * 100) / steps.length) : 0
  const badge = detail.source_badge
  const source = badge ? `Earning with ${detail.source_organization?.name || 'your issuer'}` : detail.source_organization?.name ? `From ${detail.source_organization.name}` : 'Your plan'
  const goTo = (objectiveUuid: string) => { setSelected(objectiveUuid); document.getElementById(`step-${objectiveUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }

  return <div className="flex flex-col gap-6">
    <section aria-label={detail.name} className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 rounded-2xl p-4 sm:p-5" style={{ backgroundColor: tone.ring, color: tone.foreground }}>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${tone.foreground} 12%, transparent)` }} aria-hidden="true">
          {badge?.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="badge-sticker-image h-14 w-14 object-contain" /> : badge ? <Award size={30} /> : <Target size={30} />}
        </span>
        <div className="min-w-0 flex-[1_1_220px]">
          <p className="text-xs font-medium">{source}</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{detail.name}</h1>
          {detail.description ? <p className="mt-2 text-sm">{detail.description}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="progressbar" aria-label="Plan progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 min-w-32 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${tone.foreground} 20%, transparent)` }}><span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: tone.foreground }} /></div>
            <span className="text-xs font-medium">{done} of {steps.length} done</span>
            <span className="text-xs">{RULES[detail.step_order] || RULES.any}</span>
          </div>
        </div>
      </div>
      <div className="px-4 py-1 sm:px-5"><PlanHeaderActions detail={detail} token={token} refresh={refresh} onBack={onBack} initialEditing={editDetails} onEditFinished={onHeaderEditFinished} /></div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 sm:px-5">
        <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" aria-expanded={aboutOpen} onClick={() => setAboutOpen(!aboutOpen)}>{aboutOpen ? 'Hide details' : 'About this plan'}</Button>{onEdit ? <Button variant="ghost" size="sm" onClick={onEdit}><Pencil size={14} />Edit steps</Button> : null}{next ? <Button variant="ghost" size="sm" onClick={() => goTo(next.objective_uuid)}>Go to next step</Button> : null}</div>
        {plans.length > 1 ? <Select value={detail.plan_uuid} onValueChange={(uuid) => { const plan = plans.find((item) => item.plan_uuid === uuid); if (plan) choose(plan) }}><SelectTrigger className="w-full sm:w-52" aria-label="Switch plan"><SelectValue /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.plan_uuid} value={plan.plan_uuid}>{plan.name}</SelectItem>)}</SelectContent></Select> : null}
      </div>
      {aboutOpen ? <div className="space-y-3 border-t border-border bg-muted/30 p-4 text-sm sm:px-5"><p>{badge ? `Complete the required steps to earn ${badge.name}.` : detail.description || detail.name}</p>{detail.source_assignment?.welcome_message ? <p>{detail.source_assignment.welcome_message}</p> : null}{badge ? <Button asChild variant="link" className="p-0"><a href={getUriWithOrg(orgslug, `/badges/${String(badge.badge_uuid).replace(/^badge_/, '')}`)}>View badge</a></Button> : null}</div> : null}
    </section>
    {chapters.length ? chapters.map((chapter: any) => {
      const chapterDone = chapter.items.filter((item: any) => item.progress?.status === 'completed').length
      const waiting = chapter.items.every((item: any) => item.availability?.state === 'not_ready')
      return <section key={chapter.key} aria-label={chapter.title}>
        <div className="mb-1 flex flex-wrap items-baseline gap-3 pl-11 sm:pl-12"><h2 className={cn('text-xl font-semibold tracking-tight', waiting && 'text-muted-foreground')}>{chapters.length === 1 && chapter.title === detail.name ? 'Steps' : chapter.title}</h2><span className="text-xs text-muted-foreground">{chapterDone} of {chapter.items.length} done</span></div>
        <StepStack items={chapter.items} colorFor={() => getPlanColor(detail.plan_uuid)} selectedUuid={selectedUuid} onSelect={(item) => setSelected(item.objective_uuid)} renderSelected={(item, state) => <SelectedStepBody item={item} state={state} onStart={() => item.activity_id ? router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(detail.slug)}/objectives/${item.objective_uuid}/activity`)) : setOpen(item)} onGoTo={goTo} />} />
      </section>
    }) : <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No steps yet.</p>}
    {steps.length ? <div className="flex items-center gap-3 pl-11 sm:pl-12"><Flag size={24} className="text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-semibold">{percent === 100 ? 'All steps done' : 'Your goal'}</p><p className="text-xs text-muted-foreground">{badge ? `${badge.name} badge` : 'Every step brings you closer.'}</p>{percent === 100 && badge ? <Button variant="link" asChild className="h-auto p-0 text-xs"><a href={getUriWithOrg(orgslug, '/portfolio/badges')}>View earned badges</a></Button> : null}</div></div> : null}
    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}
