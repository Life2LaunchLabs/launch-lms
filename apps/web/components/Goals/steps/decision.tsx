'use client'

import React from 'react'
import { Signpost, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { goalSteps, type DecisionOption, type Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'

type Choice = { choices: string[]; other: string; reason: string; supporting_step_uuids?: string[] }
const choiceOf = (step: Step<'decision'>): Choice => ({ choices: step.submission?.choices || [], other: step.submission?.other || '', reason: step.submission?.reason || '', supporting_step_uuids: step.submission?.supporting_step_uuids })

function DecisionRow({ step }: { step: Step<'decision'> }) {
  if (step.result?.kind !== 'choice') return null
  return <p className="mt-1 truncate text-sm font-bold text-[var(--plan-accent)]">{step.result.choices.join(', ')}</p>
}

function DecisionCard({ goal, step, actions, canWork, staff }: StepCardProps<'decision'>) {
  const config = step.config
  const saved = choiceOf(step)
  const [draft, setDraft] = React.useState<Choice>(saved)
  React.useEffect(() => setDraft(choiceOf(step)), [step])
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  // What the choice rests on: the steps the learner picked, else the answered steps earlier in the same stage.
  const supporting = React.useMemo(() => {
    const all = goalSteps(goal)
    const picked = saved.supporting_step_uuids
    if (picked?.length) return all.filter((item) => picked.includes(item.step_uuid))
    return all.filter((item) => item.stage_uuid === step.stage_uuid && item.position < step.position && (item.answer || item.result?.kind === 'text'))
  }, [goal, saved.supporting_step_uuids, step.stage_uuid, step.position])
  const toggle = (key: string) => setDraft((current) => ({ ...current, choices: current.choices.includes(key) ? current.choices.filter((item) => item !== key) : config.multiple ? [...current.choices, key] : [key], other: config.multiple ? current.other : '' }))
  const save = (next: Choice = draft) => actions.saveSubmission({ submission: next })
  const chosen = draft.choices.length + (draft.other.trim() ? 1 : 0)
  return <div className="flex flex-col gap-3">
    {config.question ? <p className="text-sm font-bold">{config.question}</p> : null}
    <StepIntro step={step} />
    <Feedback step={step} />
    {supporting.length ? <div className="flex flex-col gap-1.5">
      <p className="text-xs font-extrabold text-muted-foreground">{step.status === 'completed' ? 'What this was based on' : 'What you found'}</p>
      {supporting.map((item) => <a key={item.step_uuid} href={`#step-${item.step_uuid}`} className="rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2 text-sm">
        <span className="block text-xs font-bold text-muted-foreground">{item.title}</span>
        {item.answer || (item.result?.kind === 'text' ? item.result.text : '')}
      </a>)}
    </div> : null}
    <div className="flex flex-col gap-1.5">
      {config.options.map((option) => <button key={option.key} type="button" disabled={!open} onClick={() => toggle(option.key)} className={cn('rounded-xl border-2 px-3 py-2 text-left text-sm font-bold', draft.choices.includes(option.key) ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))]' : 'bg-background')}>{option.label}</button>)}
      {config.allow_other !== false && open ? <Input value={draft.other} onChange={(event) => setDraft({ ...draft, other: event.target.value, choices: config.multiple ? draft.choices : [] })} placeholder={config.options.length ? 'Something else' : 'Your choice'} />
        : !open && saved.other ? <p className="rounded-xl border-2 border-[var(--plan-face)] px-3 py-2 text-sm font-bold">{saved.other}</p> : null}
    </div>
    {open ? <div className="flex flex-col gap-1"><Label>Why</Label><Textarea rows={3} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} onBlur={() => save()} /></div>
      : saved.reason ? <p className="whitespace-pre-wrap text-sm text-foreground/80">{saved.reason}</p> : null}
    <FinishControls step={step} canWork={canWork} staff={staff} blocker={!chosen ? 'Make a choice first' : null}
      actions={{ ...actions, setStatus: async (status, note) => { await save(); await actions.setStatus(status, note) } }} />
  </div>
}

function DecisionConfigPanel({ config, onChange }: ConfigPanelProps<'decision'>) {
  const options = config.options || []
  const setOption = (index: number, option: DecisionOption) => onChange({ ...config, options: options.map((item, at) => at === index ? option : item) })
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1"><Label>Question</Label><Input value={config.question || ''} onChange={(event) => onChange({ ...config, question: event.target.value })} placeholder="Which path will you take?" /></div>
    <div className="flex flex-col gap-1.5">
      <Label>Options</Label>
      {options.map((option, index) => <div key={option.key} className="flex gap-2">
        <Input value={option.label} onChange={(event) => setOption(index, { ...option, label: event.target.value })} />
        <button type="button" aria-label="Remove option" onClick={() => onChange({ ...config, options: options.filter((_, at) => at !== index) })} className="p-1 text-muted-foreground"><X size={15} /></button>
      </div>)}
      <button type="button" onClick={() => onChange({ ...config, options: [...options, { key: `option_${Date.now().toString(36)}`, label: '' }] })} className="self-start text-xs font-bold text-[var(--plan-accent)]">Add an option</button>
    </div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!config.multiple} onChange={(event) => onChange({ ...config, multiple: event.target.checked })} />More than one can be picked</label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={config.allow_other !== false} onChange={(event) => onChange({ ...config, allow_other: event.target.checked })} />They can write in their own</label>
  </div>
}

export const decision: StepDefinition<'decision'> = {
  type: 'decision',
  label: 'Decision',
  hint: 'Choose between options and say why',
  icon: Signpost,
  RowResult: DecisionRow,
  CardBody: DecisionCard,
  ConfigPanel: DecisionConfigPanel,
  defaultConfig: () => ({ question: '', options: [], multiple: false, allow_other: true }),
}
