'use client'

import React from 'react'
import { PenLine } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'
import { MicButton } from '@components/Accessibility/ReadAloud'

import { tr } from '@/lib/tr'
const textOf = (step: Step<'write'>) => String(step.submission?.text || '')
const words = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0

type Save = (text: string) => Promise<boolean> // eslint-disable-line no-unused-vars

/**
 * The answer still to be saved. A save goes out once per text (blur, Mark done and leaving can all ask; a second ask
 * waits on the save already going), and a save that fails can go out again.
 */
export function pendingWrite() {
  let text = ''
  let saved = ''
  let sent: { text: string; done: Promise<boolean> } | null = null
  let save: Save = () => Promise.resolve(false)
  return {
    sync(nextText: string, nextSaved: string, nextSave: Save) { text = nextText; saved = nextSaved; save = nextSave },
    dirty: () => text !== saved && text !== sent?.text,
    flush(): Promise<boolean> {
      if (text === saved) return Promise.resolve(true)
      if (text === sent?.text) return sent.done
      const going: { text: string; done: Promise<boolean> } = { text, done: Promise.resolve(true) }
      going.done = save(text).then((ok) => { if (!ok && sent === going) sent = null; return ok })
      sent = going
      return going.done
    },
  }
}

/**
 * Leaving the step saves what was typed: going back, closing the panel or moving to another page unmounts the card
 * before any blur, and a pasted reflection was lost (DEV-206). Hiding the tab saves it too; a reload or closing the
 * tab with words still unsaved asks first.
 */
function useSaveOnLeave(text: string, saved: string, save: Save) {
  const [draft] = React.useState(pendingWrite)
  React.useLayoutEffect(() => { draft.sync(text, saved, save) })
  React.useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void draft.flush() }
    const warn = (event: BeforeUnloadEvent) => { if (draft.dirty()) { void draft.flush(); event.preventDefault(); event.returnValue = '' } }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('beforeunload', warn)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('beforeunload', warn)
      void draft.flush()
    }
  }, [draft])
  return draft
}

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
  const draft = useSaveOnLeave(open ? text : saved, saved, (value) => actions.saveSubmission({ submission: { text: value } }))
  const save = () => draft.flush()
  return <div className="flex flex-col gap-3">
    {step.config.prompt ? <p className="text-sm font-bold">{step.config.prompt}</p> : null}
    <StepIntro step={step} />
    <Feedback step={step} />
    {open ? <>
      <div className="relative">
        <Textarea value={text} onChange={(event) => setText(event.target.value)} onBlur={() => { if (dirty) save() }} rows={6} placeholder={tr('goals.write.write_here_or_tap_the', 'Write here, or tap the mic and talk')} className="pr-14" />
        <MicButton value={text} onChange={setText} className="absolute right-2 top-2" />
      </div>
      <CardNote>{count} {count === 1 ? 'word' : 'words'}{limit ? ` of ${limit}` : ''}{dirty ? tr('goals.write.not_saved_yet', ' · not saved yet') : ''}</CardNote>
    </> : saved ? <p className="whitespace-pre-wrap rounded-xl border bg-background p-3 text-sm leading-6">{saved}</p> : null}
    <FinishControls step={step} actions={{ ...actions, setStatus: async (status, note) => { if (dirty) await save(); return actions.setStatus(status, note) } }} canWork={canWork} staff={staff}
      blocker={!text.trim() ? tr('lit.write.write_something_first', 'Write something first') : limit && count > limit ? `Keep it under ${limit} words` : null} />
  </div>
}

function WriteSettings({ config, onChange }: ConfigPanelProps<'write'>) {
  return <div className="flex flex-col gap-1"><Label htmlFor="write-limit">{tr('goals.write.word_limit', 'Word limit')}</Label>
    <Input id="write-limit" type="number" min={0} className="sm:w-40" value={config.max_words || ''} onChange={(event) => onChange({ ...config, max_words: Number(event.target.value) || undefined })} placeholder={tr('goals.write.none', 'None')} />
  </div>
}

export const write: StepDefinition<'write'> = {
  type: 'write',
  get label() { return tr('goals.write.write', 'Write') },
  color: '#6B3FE0',
  get hint() { return tr('goals.write.a_written_answer_or_reflection', 'A written answer or reflection to your prompt.') },
  get example() { return tr('lit.write.what_surprised_you_on_your', 'What surprised you on your visit?') },
  icon: PenLine,
  RowResult: WriteRow,
  CardBody: WriteCard,
  SettingsPanel: WriteSettings,
  defaultConfig: () => ({}),
}
