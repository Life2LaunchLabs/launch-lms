'use client'

import React from 'react'
import { Check, Clock3, NotebookPen, RotateCcw, Sparkles, Undo2, UserCheck } from 'lucide-react'
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

  const ask = actions.ask ? <span className="ml-auto"><AskCoach onAsk={actions.ask} /></span> : null
  if (done(step)) return null
  if (step.status === 'submitted') return <CardNote icon={Clock3}>Handed in. Waiting on review.</CardNote>
  if (step.completed_by === 'staff') return <div className="flex flex-wrap items-center gap-2"><CardNote icon={UserCheck}>Someone helping with this goal marks this done.</CardNote>{ask}</div>
  if (finishesItself || !canWork) return ask
  // What still stands in the way sits beside the button it holds back, not on a line of its own.
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
    <Button type="button" variant="plan" disabled={actions.busy || !!blocker} onClick={() => actions.setStatus('completed')}>
      <Check size={15} aria-hidden="true" />{step.review_required ? 'Hand in' : finishLabel || 'Mark done'}
    </Button>
    {blocker ? <CardNote>{blocker}</CardNote> : null}
    {ask}
  </div>
}

/** Asking Coach about a step: a quiet offer beside the step's main action, never competing with it. */
export function AskCoach({ onAsk }: { onAsk: () => void }) {
  return <Button type="button" variant="ghost" onClick={onAsk} className="h-10 rounded-xl px-3 font-bold text-muted-foreground hover:bg-muted hover:text-foreground"><Sparkles size={15} aria-hidden="true" />Ask Coach</Button>
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

/**
 * The learner's note on a step, the same on every type: added whenever the step is open, kept
 * after it's done, and asked for (opened and focused) right after it's marked done.
 */
export function StepNote({ step, actions, canWork, prompted, onSettled }: { step: Step; actions: StepActions; canWork: boolean; prompted: boolean; onSettled: () => void }) {
  const saved = step.learner_note || ''
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(saved)
  const field = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => { if (prompted) { setText(saved); setEditing(true) } }, [prompted]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (editing) field.current?.focus() }, [editing])
  const close = () => { setEditing(false); onSettled() }
  const editable = canWork && !step.locked
  if (!editing) {
    if (saved) return <div className="flex flex-col gap-0.5 rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2">
      <span className="flex items-center justify-between gap-2 text-xs font-extrabold text-muted-foreground">Note
        {editable ? <button type="button" onClick={() => { setText(saved); setEditing(true) }} className="font-bold text-[var(--plan-accent)] hover:underline">Edit</button> : null}</span>
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{saved}</p>
    </div>
    if (!editable) return null
    return <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 self-start rounded-md text-xs font-bold text-muted-foreground hover:text-foreground">
      <NotebookPen size={13} aria-hidden="true" />Add a note
    </button>
  }
  return <form className="flex flex-col gap-2" onSubmit={async (event) => { event.preventDefault(); if (text.trim() === saved.trim() || await actions.saveNote(text)) close() }}>
    <label htmlFor={`note-${step.step_uuid}`} className="text-sm font-bold">{prompted ? 'Anything to add?' : 'Note'}</label>
    <Textarea ref={field} id={`note-${step.step_uuid}`} rows={3} value={text} onChange={(event) => setText(event.target.value)} maxLength={10000}
      placeholder={prompted ? 'How it went, what you noticed, what’s next' : 'Anything worth remembering about this step'} />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="plan" size="sm" disabled={actions.busy}>Save note</Button>
      <Button type="button" variant="ghost" size="sm" onClick={close}>{prompted ? 'Not now' : 'Cancel'}</Button>
    </div>
  </form>
}
