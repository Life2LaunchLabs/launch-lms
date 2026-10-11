'use client'

import React from 'react'
import { Award, ChevronLeft, ChevronRight, Flag, Pencil, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { SafeImage } from '@components/Objects/SafeImage'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { cn } from '@/lib/utils'
import { SelectedStepBody, StepStack, type StepItem } from './StepStack'
import { planTone } from './planColors'

const RULES: Record<string, string> = {
  any: 'Any order',
  in_order: 'Steps open in order',
  by_chapter: 'Chapters open in turn',
}

type PlanSummary = { plan_uuid: string; slug: string; name: string }

type PlanViewProps = {
  orgslug: string
  detail: any
  plans: PlanSummary[]
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

export default function PlanView({ orgslug, detail, plans, getPlanColor, choose, onEdit, renderObjective }: PlanViewProps) {
  const router = useRouter()
  const chapters = React.useMemo(() => chaptersOf(detail), [detail])
  const steps: StepItem[] = chapters.flatMap((chapter: any) => chapter.items)
  const next = steps.find((item) => item.availability?.state === 'open' && item.progress?.status !== 'completed') || steps.find((item) => item.progress?.status !== 'completed')
  const [selected, setSelected] = React.useState('')
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const swipeStart = React.useRef<number | null>(null)
  const selectedUuid = selected || next?.objective_uuid || ''
  const tone = planTone(getPlanColor(detail.plan_uuid))

  React.useEffect(() => {
    setSelected('')
    setAboutOpen(false)
    if (next) window.requestAnimationFrame(() => document.getElementById(`step-${next.objective_uuid}`)?.scrollIntoView({ block: 'center' }))
    // Only when another plan opens; keep the learner's scroll position while working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.plan_uuid])

  const index = Math.max(0, plans.findIndex((plan) => plan.plan_uuid === detail.plan_uuid))
  const previous = plans.length > 1 ? plans[(index + plans.length - 1) % plans.length] : null
  const following = plans.length > 1 ? plans[(index + 1) % plans.length] : null
  const done = steps.filter((item) => item.progress?.status === 'completed').length
  const percent = steps.length ? Math.round((done * 100) / steps.length) : 0
  const badge = detail.source_badge
  const source = badge ? `Earning with ${detail.source_organization?.name || 'your issuer'}` : detail.source_organization?.name ? `From ${detail.source_organization.name}` : detail.is_mine ? 'Your plan' : `${detail.subject?.name || 'Their'}’s plan`
  const helpers = (detail.collaborators || []).filter((item: any) => !item.is_subject)
  const goTo = (objectiveUuid: string) => {
    setSelected(objectiveUuid)
    document.getElementById(`step-${objectiveUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return <div className="mt-2 flex flex-col gap-8">
    <div>
      <div className="flex items-stretch gap-2 sm:gap-3">
        {previous ? <Peek plan={previous} color={getPlanColor(previous.plan_uuid)} side="left" onClick={() => choose(previous)} /> : null}
        <section aria-label={detail.name} className="relative min-w-0 flex-1 overflow-hidden rounded-[28px] text-white" style={{ backgroundColor: tone.main }}
          onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null }}
          onTouchEnd={(event) => {
            const start = swipeStart.current
            const end = event.changedTouches[0]?.clientX
            swipeStart.current = null
            if (start === null || end === undefined || Math.abs(end - start) < 60) return
            const target = end < start ? following : previous
            if (target) choose(target)
          }}>
          <div className="pointer-events-none absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-20 mix-blend-screen" aria-hidden="true" />
          <div className="relative flex flex-col gap-4 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-5 sm:gap-7">
              {badge ? <a href={getUriWithOrg(orgslug, `/badges/${String(badge.badge_uuid).replace(/^badge_/, '')}`)} aria-label={`${badge.name} badge`} className="flex h-24 w-24 shrink-0 -rotate-6 items-center justify-center overflow-hidden rounded-full border-[3px] border-white/70 bg-white/15 shadow-lg sm:h-28 sm:w-28">
                {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award size={52} strokeWidth={1.8} />}</a>
                : <span className="flex h-24 w-24 shrink-0 -rotate-6 items-center justify-center rounded-[28px] border-[3px] border-white/50 bg-white/15 sm:h-28 sm:w-28" aria-hidden="true"><Target size={52} strokeWidth={1.8} /></span>}
              <div className="flex min-w-[14rem] flex-1 flex-col gap-2">
                <span className="text-sm font-bold text-white/90">{source}</span>
                <h1 className="text-4xl font-black leading-none tracking-tight sm:text-5xl">{detail.name}</h1>
                {detail.description ? <p className="text-base text-white/90 sm:text-lg">{detail.description}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="block h-3.5 min-w-40 max-w-md flex-1 overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-[#D7F25C]" style={{ width: `${percent}%` }} /></span>
                  <strong className="whitespace-nowrap text-sm">{done} of {steps.length} done</strong>
                  <span className="whitespace-nowrap rounded-full bg-black/20 px-2.5 py-1 text-xs font-black">{RULES[detail.step_order] || RULES.any}</span>
                </div>
              </div>
              <div className="flex gap-2 self-end">
                {onEdit ? <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-white/40 bg-white/15 px-4 text-sm font-black"><Pencil size={14} />Edit plan</button> : null}
                <button type="button" onClick={() => setAboutOpen(!aboutOpen)} aria-expanded={aboutOpen} className="min-h-11 rounded-full border-2 border-white/40 bg-white/15 px-4 text-sm font-black">{aboutOpen ? 'Hide details' : 'About this plan'}</button>
              </div>
            </div>
            {aboutOpen ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <About label="What you’re working toward">{badge ? `The ${badge.name} badge. Finish every step and it’s yours.` : detail.description || detail.name}</About>
              {detail.source_assignment?.welcome_message ? <About label={`From ${detail.source_organization?.name || 'your organization'}`}>{detail.source_assignment.welcome_message}</About> : null}
              <About label="In your corner">{helpers.length ? helpers.map((item: any) => `${item.user?.name || 'Someone'} (${item.role?.name})`).join(', ') : 'Just you for now. Invite someone from the plan menu.'}</About>
            </div> : null}
          </div>
        </section>
        {following ? <Peek plan={following} color={getPlanColor(following.plan_uuid)} side="right" onClick={() => choose(following)} /> : null}
      </div>
      {plans.length > 1 ? <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Your plans">
        {plans.map((plan) => <button key={plan.plan_uuid} type="button" onClick={() => choose(plan)} aria-label={plan.name} aria-current={plan.plan_uuid === detail.plan_uuid}
          className={cn('h-2.5 rounded-full transition-all', plan.plan_uuid === detail.plan_uuid ? 'w-9' : 'w-2.5 bg-border')}
          style={plan.plan_uuid === detail.plan_uuid ? { backgroundColor: getPlanColor(plan.plan_uuid) } : undefined} />)}
      </div> : null}
    </div>

    {chapters.length ? chapters.map((chapter: any) => {
      const chapterDone = chapter.items.filter((item: any) => item.progress?.status === 'completed').length
      const waiting = chapter.items.every((item: any) => item.availability?.state === 'not_ready')
      return <section key={chapter.key} aria-label={chapter.title}>
        <div className="mb-1 flex flex-wrap items-baseline gap-3 pl-11 sm:pl-12">
          <h2 className={cn('text-2xl font-black tracking-tight', waiting && 'text-muted-foreground')}>{chapter.title}</h2>
          <span className="text-sm font-semibold text-muted-foreground">{chapterDone} of {chapter.items.length} done</span>
        </div>
        <StepStack items={chapter.items} colorFor={() => getPlanColor(detail.plan_uuid)} selectedUuid={selectedUuid} onSelect={(item) => setSelected(item.objective_uuid)}
          renderSelected={(item, state) => <SelectedStepBody item={item} state={state} onStart={() => item.activity_id ? router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(detail.slug)}/objectives/${item.objective_uuid}/activity`)) : setOpen(item)} onGoTo={goTo} />} />
      </section>
    }) : <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm font-semibold text-muted-foreground">No steps yet.</p>}

    {steps.length ? <div className="flex items-center gap-4 pl-11 sm:pl-12">
      <span className={cn('flex h-16 w-16 items-center justify-center rounded-[20px] text-white', percent < 100 && 'opacity-60')} style={{ backgroundColor: tone.ring }} aria-hidden="true"><Flag size={30} /></span>
      <div><p className="text-lg font-black">{percent === 100 ? 'Plan complete' : 'Finish line'}</p><p className="text-sm text-muted-foreground">A milestone for your portfolio</p></div>
    </div> : null}

    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}

function Peek({ plan, color, side, onClick }: { plan: PlanSummary; color: string; side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return <button type="button" onClick={onClick} aria-label={`${side === 'left' ? 'Previous' : 'Next'} plan: ${plan.name}`}
    className={cn('hidden w-14 shrink-0 flex-col items-center justify-center gap-3 py-4 text-white opacity-85 transition hover:opacity-100 sm:flex', side === 'left' ? 'rounded-r-3xl' : 'rounded-l-3xl')}
    style={{ backgroundColor: planTone(color).main }}>
    <Icon size={24} strokeWidth={3} aria-hidden="true" />
    <span className={cn('max-h-48 overflow-hidden text-sm font-black [writing-mode:vertical-rl]', side === 'left' && 'rotate-180')}>{plan.name}</span>
  </button>
}

function About({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white/95 p-4 text-foreground"><p className="text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{children}</p></div>
}
