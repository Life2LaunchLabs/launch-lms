'use client'

import React from 'react'
import { PenLine } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

const textOf = (step: Step<'write'>) => String(step.submission?.text || '')
const words = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0

function WriteRow({ step }: { step: Step<'write'> }) {
  const text = textOf(step).trim()
  return text ? <p className="mt-1 line-clamp-2 text-sm text-foreground/75">{text}</p> : null
}

function WriteCard({ step, actions, canWork, staff }: StepCardProps<'write'>) {
  const saved = textOf(step)
  const [text, setText] = React.useState(saved)
  React.useEffect(() => setText(saved), [saved])
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const limit = step.config.max_words
  const count = words(text)
  const dirty = text !== saved
  const save = () => actions.saveSubmission({ submission: { text } })
  return <div className="flex flex-col gap-3">
    {step.config.prompt ? <p className="text-sm font-bold">{step.config.prompt}</p> : null}
    <StepIntro step={step} />
    <Feedback step={step} />
    {open ? <>
      <Textarea value={text} onChange={(event) => setText(event.target.value)} onBlur={() => { if (dirty) save() }} rows={6} placeholder="Write here" />
      <CardNote>{count} {count === 1 ? 'word' : 'words'}{limit ? ` of ${limit}` : ''}{dirty ? ' · not saved yet' : ''}</CardNote>
    </> : saved ? <p className="whitespace-pre-wrap rounded-xl border bg-background p-3 text-sm leading-6">{saved}</p> : null}
    <FinishControls step={step} actions={{ ...actions, setStatus: async (status, note) => { if (dirty) await save(); await actions.setStatus(status, note) } }} canWork={canWork} staff={staff}
      blocker={!text.trim() ? 'Write something first' : limit && count > limit ? `Keep it under ${limit} words` : null} />
  </div>
}

function WriteConfigPanel({ config, onChange }: ConfigPanelProps<'write'>) {
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="flex flex-col gap-1 sm:col-span-2"><Label>Prompt</Label><Input value={config.prompt || ''} onChange={(event) => onChange({ ...config, prompt: event.target.value })} placeholder="What changed for you?" /></div>
    <div className="flex flex-col gap-1"><Label>Word limit</Label><Input type="number" min={0} value={config.max_words || ''} onChange={(event) => onChange({ ...config, max_words: Number(event.target.value) || undefined })} placeholder="None" /></div>
  </div>
}

export const write: StepDefinition<'write'> = {
  type: 'write',
  label: 'Write',
  hint: 'A written answer or reflection',
  icon: PenLine,
  RowResult: WriteRow,
  CardBody: WriteCard,
  ConfigPanel: WriteConfigPanel,
  defaultConfig: () => ({ prompt: '' }),
}
