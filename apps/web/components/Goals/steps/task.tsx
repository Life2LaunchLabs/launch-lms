'use client'

import React from 'react'
import { Camera, Check, Loader2, Plus, SquareCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { normalizeMediaUrl } from '@services/media/media'
import type { Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'
import { useHandIn } from './handIn'

import { tr } from '@/lib/tr'
const listOf = (step: Step<'task'>) => step.config.list
const items = (step: Step<'task'>) => step.entries.filter((entry) => entry.kind === 'item')
const photos = (step: Step<'task'>) => step.entries.filter((entry) => entry.kind === 'file')
/** The task asks a question to answer on the step: set by the builder, or a title or description that asks one (FEED-147). */
export const asksQuestion = (step: Pick<Step<'task'>, 'title' | 'description' | 'config'>) => Boolean(step.config.ask) || /\?\s*$/m.test(`${step.title}\n${step.description || ''}`)

/** The learner's answer, written on the step and saved when they leave the box. */
function AnswerBox({ step, open, value, onChange, onSave }: { step: Step<'task'>; open: boolean; value: string; onChange: React.Dispatch<string>; onSave: () => void }) {
  if (!open) return step.answer ? <div className="rounded-xl border bg-background p-3"><p className="text-xs font-extrabold text-muted-foreground">{tr('goals.task.your_answer', 'Your answer')}</p><p className="whitespace-pre-wrap text-sm leading-6">{step.answer}</p></div> : null
  return <div className="flex flex-col gap-1">
    <label htmlFor={`answer-${step.step_uuid}`} className="text-xs font-extrabold text-muted-foreground">{tr('goals.task.your_answer', 'Your answer')}</label>
    <Textarea id={`answer-${step.step_uuid}`} value={value} maxLength={2000} rows={2} onChange={(event) => onChange(event.target.value)} onBlur={onSave} placeholder={tr('goals.task.answer_here', 'Answer here')} />
  </div>
}

/** The photo a task asks for, in one tap: the phone's camera or photos open straight away (useHandIn). */
export function PhotoHandIn({ step, actions, open, token, viewerUserId }: { step: Step<'task'>; actions: StepCardProps<'task'>['actions']; open: boolean; token?: string; viewerUserId?: number }) {
  const list = photos(step)
  const handIn = useHandIn({ token, viewerUserId, onUploaded: (asset, file) => actions.addEntry({ kind: 'file', asset_uuid: asset.asset_uuid, url: asset.url, title: asset.title || file.name }) })
  return <div className="flex flex-col gap-2">
    {list.length ? <ul className="flex flex-wrap gap-2">
      {list.map((entry) => <li key={entry.entry_uuid} className="relative">
        <a href={normalizeMediaUrl(entry.url)} target="_blank" rel="noreferrer"><img src={normalizeMediaUrl(entry.url)} alt={entry.title || tr('goals.task.your_photo', 'Your photo')} className="h-24 w-24 rounded-xl border object-cover" /></a>
        {open ? <button type="button" aria-label={tr('goals.task.remove_photo', 'Remove photo')} onClick={() => actions.deleteEntry(entry.entry_uuid)}
          className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"><X size={14} /></button> : null}
      </li>)}
    </ul> : null}
    {open ? <>
      {handIn.input}
      <button type="button" disabled={handIn.uploading || actions.busy} onClick={() => handIn.pick('image')}
        className="inline-flex h-10 items-center gap-2 self-start rounded-xl border-2 px-3 text-sm font-bold text-[var(--plan-accent)] disabled:opacity-50">
        {handIn.uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
        {handIn.uploading ? tr('goals.task.adding_your_photo', 'Adding your photo…') : list.length ? tr('goals.task.add_another_photo', 'Add another photo') : tr('goals.task.add_a_photo', 'Add a photo')}
      </button>
    </> : !list.length ? <p className="text-xs font-semibold text-muted-foreground">{tr('goals.task.no_photo_yet', 'No photo yet')}</p> : null}
  </div>
}

function TaskRow({ step }: { step: Step<'task'> }) {
  const list = items(step)
  const shots = photos(step)
  if (!list.length && !shots.length && step.answer) return <p className="mt-1 line-clamp-2 text-sm text-foreground/75">{step.answer}</p>
  if (!list.length && shots.length) return <div className="mt-1.5 flex gap-1.5">{shots.slice(0, 4).map((entry) => <img key={entry.entry_uuid} src={normalizeMediaUrl(entry.url)} alt="" className="h-14 w-14 rounded-xl object-cover" />)}</div>
  if (!list.length) return null
  return <ul className="mt-1.5 flex flex-wrap gap-1.5">
    {list.slice(0, 4).map((item) => <li key={item.entry_uuid} className="max-w-[14rem] truncate rounded-[10px] border-[1.5px] border-[color-mix(in_srgb,var(--plan-face)_35%,transparent)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))] px-2.5 py-1 text-xs font-extrabold">{item.title || item.url}</li>)}
    {list.length > 4 ? <li className="px-1 py-1 text-xs font-bold text-muted-foreground">+{list.length - 4}</li> : null}
  </ul>
}

function TaskCard({ step, actions, canWork, staff, token, viewerUserId }: StepCardProps<'task'>) {
  const list = listOf(step)
  const entries = items(step)
  const [draft, setDraft] = React.useState('')
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const add = async () => {
    const value = draft.trim()
    if (!value) return
    await actions.addEntry(list?.item_kind === 'link' ? { kind: 'item', title: value, url: /^https?:\/\//.test(value) ? value : '' } : { kind: 'item', title: value })
    setDraft('')
  }
  const target = list?.target || 0
  const asks = asksQuestion(step)
  const [answer, setAnswer] = React.useState(step.answer || '')
  React.useEffect(() => setAnswer(step.answer || ''), [step.answer])
  const dirty = answer.trim() !== (step.answer || '').trim()
  const saveAnswer = async () => (dirty ? actions.saveSubmission({ answer }) : true)
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    {list ? <div className="flex flex-col gap-2">
      {/* The count already sits in the step's status line, right above. */}
      <p className="text-xs font-extrabold text-muted-foreground">{list.label || tr('goals.task.your_list', 'Your list')}</p>
      {entries.length ? <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => <li key={entry.entry_uuid} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
          <button type="button" disabled={!open} aria-label={entry.done ? tr('goals.task.mark_not_done', 'Mark not done') : tr('goals.shared.mark_done', 'Mark done')} onClick={() => actions.updateEntry(entry.entry_uuid, { done: !entry.done })} className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', entry.done ? 'border-[var(--plan-face)] bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'border-border')}>{entry.done ? <Check size={12} strokeWidth={3.5} /> : null}</button>
          {entry.url ? <a href={entry.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold underline-offset-2 hover:underline">{entry.title || entry.url}</a> : <span className="min-w-0 flex-1 truncate font-semibold">{entry.title}</span>}
          {open ? <button type="button" aria-label={tr('goals.upload.remove', 'Remove')} onClick={() => actions.deleteEntry(entry.entry_uuid)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
        </li>)}
      </ul> : null}
      {open ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); add() }}>
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={list.item_kind === 'link' ? tr('goals.explore_add.paste_a_link', 'Paste a link') : tr('goals.upload.add_an_item', 'Add an item')} />
        <button type="submit" disabled={actions.busy || !draft.trim()} aria-label={tr('goals.upload.add', 'Add')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 text-[var(--plan-accent)] disabled:opacity-40"><Plus size={16} /></button>
      </form> : null}
    </div> : null}
    {asks ? <AnswerBox step={step} open={open} value={answer} onChange={setAnswer} onSave={() => void saveAnswer()} /> : null}
    {step.config.photo ? <PhotoHandIn step={step} actions={actions} open={open} token={token} viewerUserId={viewerUserId} /> : null}
    <FinishControls step={step} actions={{ ...actions, setStatus: async (status, note) => (await saveAnswer()) && actions.setStatus(status, note) }} canWork={canWork} staff={staff}
      blocker={target && entries.length < target ? `Add ${target - entries.length} more first` : step.config.photo && !photos(step).length ? tr('goals.task.add_a_photo_first', 'Add a photo first')
        : step.config.ask && !answer.trim() ? tr('goals.task.answer_first', 'Answer the question first') : null} />
  </div>
}

/** Whether the task asks for a photo to show it's done, and whether it asks a question to answer on the step. */
function TaskConfigPanel({ config, onChange }: ConfigPanelProps<'task'>) {
  const row = (checked: boolean, toggle: React.Dispatch<boolean>, title: string, detail: string) => <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3">
    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={(event) => toggle(event.target.checked)} />
    <span className="min-w-0">
      <span className="block text-sm font-bold">{title}</span>
      <span className="block text-xs text-muted-foreground">{detail}</span>
    </span>
  </label>
  return <div className="flex flex-col gap-2">
    {row(!!config.photo, (on) => onChange({ ...config, photo: on || undefined }), tr('goals.task.ask_for_a_photo', 'Ask for a photo'), tr('goals.task.they_add_a_photo_to_show', 'They add a photo to show it’s done, from their camera or photos. You see it on the step.'))}
    {row(!!config.ask, (on) => onChange({ ...config, ask: on || undefined }), tr('goals.task.ask_for_an_answer', 'Ask for an answer'), tr('goals.task.they_answer_on_the_step', 'They answer your question on the step before it’s done. A title that asks a question gets an answer box anyway.'))}
  </div>
}

export const task: StepDefinition<'task'> = {
  type: 'task',
  get label() { return tr('goals.task.task', 'Task') },
  color: '#2F66D6',
  get hint() { return tr('goals.task.something_to_do_and_tick', 'Something to do and tick off. Add a checklist if it has parts.') },
  get example() { return tr('lit.task.open_a_savings_account', 'Open a savings account') },
  icon: SquareCheck,
  statusLine: (step) => {
    const target = listOf(step)?.target
    if (target) return `${items(step).length} of ${target}`
    if (step.config.photo) return photos(step).length ? tr('goals.task.photo_added', 'Photo added') : tr('goals.task.photo_asked', 'Asks for a photo')
    return step.config.ask && !step.answer ? tr('goals.task.answer_asked', 'Asks for an answer') : null
  },
  RowResult: TaskRow,
  CardBody: TaskCard,
  ConfigPanel: TaskConfigPanel,
  defaultConfig: () => ({}),
}
