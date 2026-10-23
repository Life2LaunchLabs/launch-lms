'use client'

import React from 'react'
import { Check, Signpost, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { goalSteps, type DecisionConfig, type DecisionOption, type Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'

type Choice = { choices: string[]; other: string; supporting_step_uuids?: string[] }
const choiceOf = (step: Step<'decision'>): Choice => ({ choices: step.submission?.choices || [], other: step.submission?.other || '', ...(step.submission?.supporting_step_uuids?.length ? { supporting_step_uuids: step.submission.supporting_step_uuids } : {}) })
const MIN_OPTIONS = 2

/** The mark beside an option: a circle when one can be picked, a box when several can. */
function Mark({ on, multiple }: { on: boolean; multiple?: boolean }) {
  return <span aria-hidden="true" className={cn('grid h-5 w-5 shrink-0 place-items-center border-2', multiple ? 'rounded-md' : 'rounded-full',
    on ? 'border-[var(--plan-face)] bg-[var(--plan-face)] text-[var(--plan-face-ink)]' : 'border-border bg-background')}>{on ? <Check size={12} strokeWidth={3.5} /> : null}</span>
}

function DecisionRow({ step }: { step: Step<'decision'> }) {
  if (step.result?.kind !== 'choice') return null
  return <p className="mt-1 truncate text-sm font-bold text-[var(--plan-accent)]">{step.result.choices.join(', ')}</p>
}

function DecisionCard({ goal, step, actions, canWork, staff }: StepCardProps<'decision'>) {
  const config = step.config
  const saved = choiceOf(step)
  const savedKey = JSON.stringify(saved)
  const [draft, setDraft] = React.useState<Choice>(saved)
  // Only a new saved choice replaces what's being typed; a refresh of the goal doesn't.
  React.useEffect(() => setDraft(JSON.parse(savedKey)), [savedKey])
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  // What the choice rests on: the steps the learner picked, else the answered steps earlier in the same stage.
  const supporting = React.useMemo(() => {
    const all = goalSteps(goal)
    const picked = saved.supporting_step_uuids
    if (picked?.length) return all.filter((item) => picked.includes(item.step_uuid))
    return all.filter((item) => item.stage_uuid === step.stage_uuid && item.position < step.position && (item.answer || item.result?.kind === 'text'))
  }, [goal, saved.supporting_step_uuids, step.stage_uuid, step.position])
  const save = (next: Choice) => (JSON.stringify(next) === savedKey ? Promise.resolve(true) : actions.saveSubmission({ submission: next }))
  const choose = (next: Choice) => { setDraft(next); void save(next) }
  const toggle = (key: string) => choose({ ...draft, choices: draft.choices.includes(key) ? draft.choices.filter((item) => item !== key) : config.multiple ? [...draft.choices, key] : [key], other: config.multiple ? draft.other : '' })
  const writeIn = (other: string) => setDraft({ ...draft, other, choices: config.multiple || !other.trim() ? draft.choices : [] })
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
    <div role={config.multiple ? 'group' : 'radiogroup'} aria-label="Options" className="flex flex-col gap-1.5">
      {config.options.map((option) => { const on = draft.choices.includes(option.key); return <button key={option.key} type="button" role={config.multiple ? 'checkbox' : 'radio'} aria-checked={on} disabled={!open} onClick={() => toggle(option.key)}
        className={cn('flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition', on ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_13%,hsl(var(--card)))]' : 'bg-background enabled:hover:border-[var(--plan-face)]')}>
        <Mark on={on} multiple={config.multiple} />{option.label}
      </button> })}
      {config.allow_other !== false && open ? <form className={cn('flex items-center gap-3 rounded-xl border-2 px-3 py-1', draft.other.trim() ? 'border-[var(--plan-face)]' : 'border-dashed')} onSubmit={(event) => { event.preventDefault(); void save(draft) }}>
        <Mark on={Boolean(draft.other.trim())} multiple={config.multiple} />
        <Input value={draft.other} onChange={(event) => writeIn(event.target.value)} onBlur={() => void save(draft)} maxLength={300} aria-label="Your own choice"
          placeholder={config.options.length ? 'Something else' : 'Your choice'} className="h-8 border-0 bg-transparent px-0 font-bold shadow-none focus-visible:ring-0" />
      </form> : !open && saved.other ? <p className="flex items-center gap-3 rounded-xl border-2 border-[var(--plan-face)] px-3 py-2 text-sm font-bold"><Mark on multiple={config.multiple} />{saved.other}</p> : null}
    </div>
    <FinishControls step={step} canWork={canWork} staff={staff} blocker={!chosen ? 'Make a choice first' : null}
      actions={{ ...actions, setStatus: async (status, note) => (await save(draft)) && actions.setStatus(status, note) }} />
  </div>
}

/** The options as the learner will see them: at least two, each a row to pick. */
function DecisionConfigPanel({ config, onChange }: ConfigPanelProps<'decision'>) {
  const options = config.options || []
  const rows: DecisionOption[] = [...options, ...Array.from({ length: Math.max(0, MIN_OPTIONS - options.length) }, () => ({ key: '', label: '' }))]
  const setRow = (index: number, label: string) => onChange({ ...config, options: rows.map((item, at) => ({ key: item.key || `option_${Date.now().toString(36)}_${at}`, label: at === index ? label : item.label })) })
  return <div className="flex flex-col gap-1.5">
    <Label>Options</Label>
    <ol className="flex flex-col gap-1.5 border-l-2 border-[color-mix(in_srgb,var(--plan-face)_40%,transparent)] pl-3">
      {rows.map((option, index) => <li key={index} className="flex items-center gap-2 rounded-xl border-2 bg-background px-3 py-1">
        <Mark on={false} multiple={config.multiple} />
        <Input value={option.label} onChange={(event) => setRow(index, event.target.value)} aria-label={`Option ${index + 1}`} placeholder={`Option ${index + 1}`} maxLength={300}
          className="h-8 border-0 bg-transparent px-0 font-bold shadow-none focus-visible:ring-0" />
        {rows.length > MIN_OPTIONS ? <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => onChange({ ...config, options: rows.filter((_, at) => at !== index) })} className="p-1 text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
      </li>)}
    </ol>
    <button type="button" onClick={() => onChange({ ...config, options: [...rows.map((item, at) => ({ ...item, key: item.key || `option_${Date.now().toString(36)}_${at}` })), { key: `option_${Date.now().toString(36)}_${rows.length}`, label: '' }] })}
      className="ml-3 self-start text-xs font-bold text-[var(--plan-accent)]">Add an option</button>
  </div>
}

function DecisionSettings({ config, onChange }: ConfigPanelProps<'decision'>) {
  return <div className="flex flex-col gap-2">
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!config.multiple} onChange={(event) => onChange({ ...config, multiple: event.target.checked })} />More than one can be picked</label>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={config.allow_other !== false} onChange={(event) => onChange({ ...config, allow_other: event.target.checked })} />They can write in their own</label>
  </div>
}

const cleanOptions = (config: DecisionConfig): DecisionConfig => ({ ...config, options: (config.options || []).map((option) => ({ ...option, label: option.label.trim() })).filter((option) => option.label) })

export const decision: StepDefinition<'decision'> = {
  type: 'decision',
  label: 'Decision',
  color: '#C77A0E',
  hint: 'Choose between options, like which pathway to follow.',
  example: 'Pick a career area to explore',
  icon: Signpost,
  RowResult: DecisionRow,
  CardBody: DecisionCard,
  ConfigPanel: DecisionConfigPanel,
  SettingsPanel: DecisionSettings,
  cleanConfig: cleanOptions,
  configProblem: (config) => cleanOptions(config).options.length < MIN_OPTIONS ? 'Give it at least two options' : null,
  defaultConfig: () => ({ options: [], multiple: false, allow_other: true }),
}
