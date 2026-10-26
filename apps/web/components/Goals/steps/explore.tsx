'use client'

import React from 'react'
import { Check, Compass, FileText } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { AskCoach, CardNote, Feedback, FinishControls, StepIntro } from './shared'
import { evidenceOf, ExploreBoard, KIND, pinned, Thumb, type Evidence } from './exploreBoard'
import { ExploreSuggestions } from './exploreSuggestions'

function ExploreRow({ step }: { step: Step<'explore'> }) {
  const result = step.result?.kind === 'explore' ? step.result : null
  if (!result) return null
  if (result.answer) return <p className="mt-1 line-clamp-2 text-sm font-bold text-[var(--plan-accent)]">{result.answer}</p>
  // A picture shows as itself; anything else by its title, like a task's items, so the row says what was found.
  return <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
    {result.thumbs.map((thumb, index) => thumb.image ? <img key={index} src={thumb.image} alt={thumb.title || ''} className="h-10 w-10 rounded-lg object-cover" />
      : <span key={index} className="flex max-w-[14rem] items-center gap-1.5 rounded-[10px] border-[1.5px] border-[color-mix(in_srgb,var(--plan-face)_35%,transparent)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))] px-2.5 py-1 text-xs font-extrabold">
        {React.createElement(KIND[thumb.kind as Evidence]?.icon || FileText, { size: 13, 'aria-hidden': true, className: 'shrink-0 text-[var(--plan-accent)]' })}<span className="truncate">{thumb.title || thumb.url || KIND[thumb.kind as Evidence]?.label}</span>
      </span>)}
    {result.count > result.thumbs.length ? <span className="px-1 text-xs font-bold text-muted-foreground">+{result.count - result.thumbs.length}</span> : null}
  </div>
}

/** Done, from the learner: the board stays as it is and they say what they made of it. */
function Outcome({ step, actions, onCancel }: { step: Step<'explore'>; actions: StepCardProps<'explore'>['actions']; onCancel: () => void }) {
  const [outcome, setOutcome] = React.useState(step.answer || '')
  const finish = async () => {
    if (!outcome.trim()) return
    if (await actions.saveSubmission({ answer: outcome.trim() })) await actions.setStatus('completed')
  }
  return <form className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--plan-face)] bg-background p-3" onSubmit={(event) => { event.preventDefault(); void finish() }}>
    <Label htmlFor={`outcome-${step.step_uuid}`} className="text-sm font-bold">What did you land on?</Label>
    <Textarea id={`outcome-${step.step_uuid}`} autoFocus rows={3} maxLength={2000} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="What you found out, what you decided, what’s next" />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="plan" disabled={actions.busy || !outcome.trim()}><Check size={15} aria-hidden="true" />{step.review_required ? 'Hand in' : 'Finish'}</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>Not yet</Button>
    </div>
  </form>
}

/** A finished board: what was pinned, the outcome, and the rest a tap away. */
function ClosedBoard(props: StepCardProps<'explore'>) {
  const { step } = props
  const entries = evidenceOf(step)
  const kept = entries.filter(pinned)
  const [all, setAll] = React.useState(false)
  return <div className="flex flex-col gap-2">
    {kept.length ? <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">{kept.map((entry) => <button key={entry.entry_uuid} type="button" onClick={() => setAll(true)} className="flex min-w-0 flex-col gap-1 rounded-xl p-1 text-left hover:bg-muted">
      <Thumb entry={entry} className="w-full" /><span className="line-clamp-2 px-0.5 text-xs font-bold leading-snug">{entry.title || entry.note || entry.url}</span>
    </button>)}</div> : null}
    {step.answer ? <p className="whitespace-pre-wrap rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2 text-sm font-bold">{step.answer}</p> : null}
    {entries.length ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>See all {entries.length} on the board</Button> : null}
    {all ? <Dialog open onOpenChange={setAll}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{step.title}</DialogTitle></DialogHeader>
        <ExploreBoard step={step} actions={props.actions} open={false} orgId={props.goal.org_id} orgslug={props.orgslug} token={props.token} viewerUserId={props.viewerUserId} full />
      </DialogContent>
    </Dialog> : null}
  </div>
}

function ExploreCard(props: StepCardProps<'explore'>) {
  const { goal, step, actions, canWork, staff, orgslug, token, viewerUserId } = props
  const [finishing, setFinishing] = React.useState(false)
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const learnerFinishes = !staff && canWork && !step.locked && step.completed_by === 'learner' && open
  return <div className="flex flex-col gap-3">
    {step.config.question ? <p className="text-sm font-bold">{step.config.question}</p> : null}
    <StepIntro step={step} />
    <Feedback step={step} />
    {open ? <ExploreBoard step={step} actions={actions} open orgId={goal.org_id} orgslug={orgslug} token={token} viewerUserId={viewerUserId} /> : <ClosedBoard {...props} />}
    {learnerFinishes ? finishing ? <Outcome step={step} actions={actions} onCancel={() => setFinishing(false)} /> : <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" variant="plan" onClick={() => setFinishing(true)}><Check size={15} aria-hidden="true" />Mark done</Button>
      {actions.ask ? <span className="ml-auto"><AskCoach onAsk={actions.ask} /></span> : null}
    </div> : <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} />}
    {open && !evidenceOf(step).length && !staff ? <CardNote>Collect what you find here, then tap Mark done to say what you made of it.</CardNote> : null}
  </div>
}

function ExploreSettings({ config, onChange }: ConfigPanelProps<'explore'>) {
  return <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!config.ratings} onChange={(event) => onChange({ ...config, ratings: event.target.checked })} />Rate each find, 1 to 5 stars</label>
}

export const explore: StepDefinition<'explore'> = {
  type: 'explore',
  label: 'Explore',
  color: '#0B8077',
  hint: 'Research on a board of links, files and notes, ending in what they found.',
  example: 'Research three jobs in health care',
  icon: Compass,
  statusLine: (step) => {
    const count = evidenceOf(step).length
    return step.answer ? null : count ? `${count} found` : null
  },
  RowResult: ExploreRow,
  CardBody: ExploreCard,
  ConfigPanel: ExploreSuggestions,
  SettingsPanel: ExploreSettings,
  notePrompt: false,
  defaultConfig: () => ({ suggestions: [] }),
}
