'use client'

import React from 'react'
import { CalendarDays, Check, Loader2 } from 'lucide-react'
import ScheduleLine, { DATE_INPUT } from '@components/Assignments/ScheduleLine'
import type { AssignmentDetail, AssignmentStage } from '@services/assignments/assignments'
import { draftProblem, scheduleDraft, type ScheduleDraft } from '@services/assignments/page'
import { shortDate } from '@services/assignments/status'
import Overview from './Overview'
import StepCard, { type StepCardContext } from './StepCard'

function StageHead({ stage, many, children }: { stage: AssignmentStage; many: boolean; children?: React.ReactNode }) {
  return <div className="mb-2 mt-[18px] flex flex-wrap items-center gap-2.5">
    <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-muted-foreground">{many ? `Stage ${stage.position + 1}` : 'Steps'}</span>
    <h3 className="text-base font-bold">{stage.title}</h3>
    {children}
  </div>
}

/**
 * The Steps tab: the overview, then every step by stage. Schedule turns the list into each
 * stage's start, a quiet line per step to give it its own dates, and the last day, saved at once.
 */
export default function StepsTab({ ctx, scheduling, setScheduling, onSave }: {
  ctx: StepCardContext
  scheduling: boolean
  setScheduling: (on: boolean) => void // eslint-disable-line no-unused-vars
  onSave: (draft: ScheduleDraft) => Promise<boolean> // eslint-disable-line no-unused-vars
}) {
  const { detail } = ctx
  const [openStep, setOpenStep] = React.useState<string | null>(null)
  const many = detail.stages.length > 1
  const current = detail.status === 'ended' ? -1 : detail.stage?.position ?? -1
  const editable = detail.can_manage && detail.status !== 'ended'
  if (scheduling && editable) return <ScheduleEditor detail={detail} onCancel={() => setScheduling(false)} onSave={onSave} />
  return <div>
    <Overview detail={detail} />
    <div className="mb-2.5 mt-7 flex items-center justify-between gap-3">
      <h2 className="text-xl font-bold">Steps</h2>
      {editable ? <button type="button" onClick={() => setScheduling(true)} className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">
        <CalendarDays size={16} aria-hidden="true" />Schedule
      </button> : null}
    </div>
    {detail.stages.map((stage) => <section key={stage.key} aria-label={stage.title}>
      {many ? <StageHead stage={stage} many>
        {detail.scheduled && stage.start_date ? <span className="text-[12.5px] text-muted-foreground">Starts {shortDate(stage.start_date)}</span> : null}
        {stage.position === current ? <span className="rounded-full bg-brand px-2 py-px text-[11px] font-extrabold tracking-wide text-white">Now</span> : null}
      </StageHead> : null}
      <div className="flex flex-col gap-2">
        {stage.steps.map((step) => <StepCard key={step.key} step={step} ctx={ctx} open={openStep === step.key} onToggle={() => setOpenStep(openStep === step.key ? null : step.key)} />)}
      </div>
    </section>)}
  </div>
}

function DateField({ label, value, aria, onChange }: { label: string; value: string; aria: string; onChange: (value: string) => void }) { // eslint-disable-line no-unused-vars
  return <label className="ml-auto flex items-center gap-2 text-xs font-bold text-muted-foreground">{label}
    <input type="date" className={DATE_INPUT} value={value} aria-label={aria} onChange={(event) => onChange(event.target.value)} />
  </label>
}

function ScheduleEditor({ detail, onCancel, onSave }: { detail: AssignmentDetail; onCancel: () => void; onSave: (draft: ScheduleDraft) => Promise<boolean> }) { // eslint-disable-line no-unused-vars
  const [draft, setDraft] = React.useState(() => scheduleDraft(detail))
  const [openLine, setOpenLine] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const problem = draftProblem(draft)
  const many = detail.stages.length > 1
  const save = async () => {
    setSaving(true)
    try { if (await onSave(draft)) onCancel() } finally { setSaving(false) }
  }
  return <div>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold">Schedule</h2>
      <span className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-full px-3.5 text-[13px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
        <button type="button" disabled={Boolean(problem) || saving} onClick={() => void save()}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} aria-hidden="true" />}Save
        </button>
      </span>
    </div>
    <p className="mt-1.5 text-[13.5px] text-muted-foreground">Click a step to give it its own dates. Steps without dates follow their stage.</p>
    {problem ? <p role="alert" className="mt-2 text-[13px] font-semibold text-late">{problem}</p> : null}
    {detail.stages.map((stage) => <section key={stage.key} aria-label={stage.title}>
      <StageHead stage={stage} many={many}>
        <DateField label="Starts" value={draft.stages[stage.key] || ''} aria={`${stage.title} starts`} onChange={(value) => setDraft({ ...draft, stages: { ...draft.stages, [stage.key]: value } })} />
      </StageHead>
      <div className="flex flex-col">
        {stage.steps.map((step) => <ScheduleLine key={step.key} step={step} dates={draft.steps[step.key] || {}} event={step.type === 'event' ? step.config?.date : null}
          open={openLine === step.key} onToggle={() => setOpenLine(openLine === step.key ? null : step.key)}
          onChange={(dates) => setDraft({ ...draft, steps: { ...draft.steps, [step.key]: dates } })} />)}
      </div>
    </section>)}
    <div className="mb-2 mt-[18px] flex flex-wrap items-center gap-2.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-muted-foreground">End</span>
      <h3 className="text-base font-bold">Last day</h3>
      <DateField label="Ends" value={draft.end} aria="Last day" onChange={(value) => setDraft({ ...draft, end: value })} />
    </div>
  </div>
}
