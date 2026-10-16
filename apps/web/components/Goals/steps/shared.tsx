'use client'

import React from 'react'
import { Check, Clock3, RotateCcw, Undo2, UserCheck } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import type { Step } from '@services/goals/types'
import type { StepActions } from './registry'

const done = (step: Step) => step.status === 'completed' || step.status === 'excused'

/** A short muted line inside a card. */
export function CardNote({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{Icon ? <Icon size={13} aria-hidden="true" /> : null}{children}</p>
}

/** Feedback from the last time staff sent the step back. */
export function Feedback({ step }: { step: Step }) {
  const last = step.feedback_history[step.feedback_history.length - 1]
  if (step.status !== 'changes_requested' || !last) return null
  return <div className="rounded-xl border-l-4 border-destructive bg-destructive/5 px-3 py-2 text-sm">
    <p className="text-xs font-extrabold text-destructive">Needs another go</p>
    <p className="mt-0.5 whitespace-pre-wrap text-foreground/80">{last.message}</p>
  </div>
}

/**
 * How the step gets finished, from where the viewer stands: the learner marks it done or
 * hands it in, staff approve, send back, complete it for the learner or reopen it.
 */
export function FinishControls({ step, actions, canWork, staff, finishesItself = false, blocker, finishLabel }: { step: Step; actions: StepActions; canWork: boolean; staff: boolean; finishesItself?: boolean; blocker?: string | null; finishLabel?: string }) {
  const [sendingBack, setSendingBack] = React.useState(false)
  const [note, setNote] = React.useState('')
  if (step.locked) return null

  if (staff) {
    if (step.status === 'submitted') {
      if (sendingBack) return <div className="flex flex-col gap-2">
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should they change?" rows={3} autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="plan" disabled={actions.busy || !note.trim()} onClick={async () => { await actions.setStatus('changes_requested', note.trim()); setSendingBack(false); setNote('') }}>Send back</Button>
          <Button type="button" variant="surface" onClick={() => setSendingBack(false)}>Cancel</Button>
        </div>
      </div>
      return <div className="flex flex-wrap gap-2">
        <Button type="button" variant="plan" disabled={actions.busy} onClick={() => actions.setStatus('completed')}><Check size={15} aria-hidden="true" />Approve</Button>
        <Button type="button" variant="surface" disabled={actions.busy} onClick={() => setSendingBack(true)}><RotateCcw size={15} aria-hidden="true" />Send back</Button>
      </div>
    }
    if (done(step)) return <Button type="button" variant="surface" disabled={actions.busy} onClick={() => actions.setStatus('in_progress')}><Undo2 size={15} aria-hidden="true" />Reopen</Button>
    return <div className="flex flex-wrap gap-2">
      <Button type="button" variant="plan" disabled={actions.busy} onClick={() => actions.setStatus('completed')}><UserCheck size={15} aria-hidden="true" />{step.completed_by === 'staff' ? 'Mark done' : 'Mark done for them'}</Button>
      <Button type="button" variant="surface" disabled={actions.busy} onClick={() => actions.setStatus('excused')}>Excuse</Button>
    </div>
  }

  if (done(step)) return null
  if (step.status === 'submitted') return <CardNote icon={Clock3}>Handed in. Waiting on review.</CardNote>
  if (step.completed_by === 'staff') return <CardNote icon={UserCheck}>Someone helping with this goal marks this done.</CardNote>
  if (finishesItself || !canWork) return null
  return <div className="flex flex-col gap-1.5">
    <Button type="button" variant="plan" className="self-start" disabled={actions.busy || !!blocker} onClick={() => actions.setStatus('completed')}>
      <Check size={15} aria-hidden="true" />{step.review_required ? 'Hand in' : finishLabel || 'Mark done'}
    </Button>
    {blocker ? <CardNote>{blocker}</CardNote> : null}
  </div>
}

/** The description, with the step's materials under it. */
export function StepIntro({ step }: { step: Step }) {
  const materials = step.materials.filter((item) => item && (item.url || item.title))
  if (!step.description && !materials.length) return null
  return <div className="flex flex-col gap-2">
    {step.description ? <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{step.description}</p> : null}
    {materials.length ? <div className="flex flex-wrap gap-1.5">
      {materials.map((item, index) => <a key={index} href={String(item.url || '#')} target="_blank" rel="noreferrer" className="rounded-[10px] border-[1.5px] bg-background px-2.5 py-1.5 text-xs font-bold hover:border-[var(--plan-face)]">{String(item.title || item.url)}</a>)}
    </div> : null}
  </div>
}
