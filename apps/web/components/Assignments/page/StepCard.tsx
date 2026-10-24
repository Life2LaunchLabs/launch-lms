'use client'

import React from 'react'
import Link from 'next/link'
import { ClipboardCheck, Clock, Link2, MessageSquareText, NotebookPen, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import { stepDefinition } from '@components/Goals/steps'
import type { StepDraft } from '@components/Goals/edit/StepEditor'
import StaffGuideViewer, { guideItems } from '@components/Goals/admin/assignments/StaffGuideViewer'
import StepPreview from '@components/Plans/plan/StepPreview'
import StatusBar from '@components/Assignments/StatusBar'
import { NeedChips } from '@components/Assignments/Needs'
import { PersonTile } from '@components/Assignments/Pair'
import type { AssignmentDetail, AssignmentPerson, AssignmentStep, StatusCategory } from '@services/assignments/assignments'
import { stepNeeds, stepWhen } from '@services/assignments/page'
import { CATEGORIES, firstName, personLabel, plural } from '@services/assignments/status'
import type { StepMaterial, StepTypeKey } from '@services/goals/types'

export interface StepCardContext {
  detail: AssignmentDetail
  orgId: number
  orgslug: string
  token?: string
  /** Where staff review this step's work. */
  reviewHref: (stepKey: string) => string // eslint-disable-line no-unused-vars
  onMessageStep: (stepKey: string) => void // eslint-disable-line no-unused-vars
  onMessageLearner: (person: AssignmentPerson) => void // eslint-disable-line no-unused-vars
}

const CHIP = 'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold [&_svg]:h-4 [&_svg]:w-4'

/**
 * One step of the assignment. Closed: its type, title, dates, what waits on staff, and where
 * learners are, with names on hover. Opened: what waits on staff as buttons, then what learners
 * read, Try it, and the staff instructions.
 */
export default function StepCard({ step, open, onToggle, ctx }: { step: AssignmentStep; open: boolean; onToggle: () => void; ctx: StepCardContext }) {
  const { detail } = ctx
  const type = stepDefinition(step.type as StepTypeKey)
  const Icon = type.icon
  const ended = detail.status === 'ended'
  const needs = stepNeeds(step, ended)
  const [lateOpen, setLateOpen] = React.useState(false)
  const learners = detail.learner_count
  const names = React.useMemo(() => {
    const out: Partial<Record<StatusCategory, string[]>> = {}
    for (const { key } of CATEGORIES) out[key] = (step.who[key] || []).map((id) => firstName(detail.people[String(id)]))
    return out
  }, [step.who, detail.people])
  const only = learners === 1 ? CATEGORIES.find(({ key }) => step.counts[key])?.label : null
  const upcoming = step.counts.locked > 0 && step.counts.locked === learners
  return <div className={cn('rounded-2xl border border-border bg-card transition-shadow', open && 'shadow-[0_1px_2px_hsl(200_30%_10%/0.06),0_8px_28px_hsl(200_30%_10%/0.08)]')}>
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 rounded-2xl px-3.5 py-3 text-left md:grid-cols-[40px_minmax(0,1fr)_minmax(150px,230px)]">
      <span className={cn('grid h-10 w-10 place-items-center rounded-xl text-white', upcoming && 'opacity-45')} style={{ background: type.color }}><Icon size={20} aria-hidden="true" /></span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="text-[14.5px] font-semibold">{step.title}</b>
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {type.label}<i aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-current opacity-60" />{stepWhen(step, detail.scheduled)}
          {!open ? <NeedChips messages={needs.messages} review={needs.review} behind={needs.late.length} className="ml-0.5" /> : null}
        </span>
      </span>
      <span className="col-start-2 flex min-w-0 flex-col gap-1.5 md:col-start-auto">
        {learners ? <>
          <span className="flex justify-end text-xs text-muted-foreground">{learners > 1 ? <span><b className="text-foreground">{step.counts.done}</b>/{learners} complete</span> : only}</span>
          <StatusBar counts={step.counts} names={learners > 1 ? names : undefined} now={false} label={step.title} />
        </> : <span className="text-right text-xs text-muted-foreground">No learners yet</span>}
      </span>
    </button>
    {open ? <div className="pb-4 pl-4 pr-4 md:pl-[68px]">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => ctx.onMessageStep(step.key)} className={cn(CHIP, needs.messages ? 'bg-ask-soft text-ask' : 'border border-border bg-card hover:bg-muted')}>
          <MessageSquareText aria-hidden="true" />{needs.messages ? plural(needs.messages, 'message') : 'Messages'}
        </button>
        {step.review_required ? needs.review
          ? <Link href={ctx.reviewHref(step.key)} className={cn(CHIP, 'bg-brand text-white hover:brightness-110')}><ClipboardCheck aria-hidden="true" />{needs.review} to review</Link>
          : <span className={cn(CHIP, 'text-muted-foreground')}><ClipboardCheck aria-hidden="true" />Nothing to review</span> : null}
        {needs.late.length ? <button type="button" aria-expanded={lateOpen} onClick={() => setLateOpen(!lateOpen)} className={cn(CHIP, 'bg-late-soft text-late', lateOpen && 'ring-2 ring-late/40')}>
          <Clock aria-hidden="true" />{needs.late.length} past due
        </button> : null}
      </div>
      {lateOpen && needs.late.length ? <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {needs.late.map((id) => detail.people[String(id)]).filter(Boolean).map((person) => <button key={person.id} type="button" onClick={() => ctx.onMessageLearner(person)}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-[13px] font-semibold hover:bg-muted">
          <PersonTile person={person} size="sm" />{personLabel(person)}
        </button>)}
        <span className="text-xs text-muted-foreground">Each sees a past-due line in their messages.</span>
      </div> : null}
      <StepBody step={step} ctx={ctx} />
    </div> : null}
  </div>
}

function StepBody({ step, ctx }: { step: AssignmentStep; ctx: StepCardContext }) {
  const [trying, setTrying] = React.useState(false)
  const [guide, setGuide] = React.useState(false)
  const materials = (step.materials || []) as StepMaterial[]
  const staffMaterials = (step.staff_materials || []) as StepMaterial[]
  const items = guideItems(step.staff_guide || '', staffMaterials)
  const draft = { type: step.type, title: step.title, description: step.description, config: step.config, completed_by: step.completed_by, review_required: step.review_required,
    reviewer_guidance: step.reviewer_guidance, after: [], materials } as unknown as StepDraft
  return <div className="mt-3.5 flex flex-col gap-2.5 border-t border-border pt-3.5">
    {step.description ? <p className="whitespace-pre-line text-sm leading-relaxed">{step.description}</p> : null}
    {materials.length ? <div className="flex flex-wrap gap-1.5">{materials.map((item, index) => <a key={index} href={item.url} target="_blank" rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[12.5px] font-semibold hover:underline"><Link2 size={14} className="text-muted-foreground" aria-hidden="true" />{item.title || item.url}</a>)}</div> : null}
    <div className="flex flex-wrap items-start gap-3">
      <button type="button" onClick={() => setTrying(true)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">
        <Play size={15} aria-hidden="true" />Try it
      </button>
      {step.staff_guide || staffMaterials.length ? <div className="min-w-0 flex-1 rounded-xl bg-amber-50 px-3 py-2.5 text-[13.5px] leading-relaxed dark:bg-amber-950/50">
        <b className="mb-0.5 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"><NotebookPen size={14} aria-hidden="true" />Staff instructions</b>
        {step.staff_guide ? <p className="line-clamp-6 whitespace-pre-line">{step.staff_guide}</p> : null}
        {staffMaterials.length ? <button type="button" onClick={() => setGuide(true)} className="mt-1 text-[12.5px] font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-300">
          Open the guide · {plural(staffMaterials.length, 'file')}</button> : null}
      </div> : <span className="pt-2 text-[13px] text-muted-foreground">No staff instructions for this step.</span>}
    </div>
    <Dialog open={trying} onOpenChange={setTrying}>
      <DialogContent className="flex max-w-[420px] justify-center border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">{step.title}, as learners see it</DialogTitle>
        <StepPreview draft={draft} plan={ctx.detail.plan as any} orgId={ctx.orgId} orgslug={ctx.orgslug} token={ctx.token} />
      </DialogContent>
    </Dialog>
    {guide ? <StaffGuideViewer open={guide} onOpenChange={setGuide} stepTitle={step.title} items={items} /> : null}
  </div>
}
