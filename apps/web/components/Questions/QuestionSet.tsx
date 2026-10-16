'use client'

import React from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { answerText, type HubQuestion, type HubQuestionAnswer } from '@services/hub/questions'

type Draft = { skipped?: boolean; option_ids?: string[]; text?: string; value?: number }
// eslint-disable-next-line no-unused-vars
type OnDraft = (next: Draft) => void

const chip = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50'
const chipOn = 'border-foreground bg-foreground text-background'
const chipOff = 'border-border bg-background text-foreground hover:border-foreground/40'

function answered(question: HubQuestion, draft?: Draft) {
  if (!draft) return false
  if (draft.skipped) return true
  if (question.kind === 'text') return Boolean(draft.text?.trim())
  if (question.kind === 'scale') return typeof draft.value === 'number'
  return Boolean(draft.option_ids?.length)
}

function Choices({ question, draft, disabled, onChange }: { question: HubQuestion; draft: Draft; disabled: boolean; onChange: OnDraft }) {
  const multiple = question.kind === 'multiple'
  const chosen = draft.option_ids || []
  return <div role={multiple ? 'group' : 'radiogroup'} aria-label={question.prompt} className="flex flex-wrap gap-2">
    {question.options.map((option) => {
      const on = chosen.includes(option.id)
      return <button key={option.id} type="button" disabled={disabled} role={multiple ? 'checkbox' : 'radio'} aria-checked={on} className={`${chip} ${on ? chipOn : chipOff}`}
        onClick={() => onChange({ option_ids: multiple ? (on ? chosen.filter((id) => id !== option.id) : [...chosen, option.id]) : [option.id] })}>
        {multiple && on ? <Check size={12} aria-hidden="true" /> : null}{option.label}
      </button>
    })}
  </div>
}

function Scale({ question, draft, disabled, onChange }: { question: HubQuestion; draft: Draft; disabled: boolean; onChange: OnDraft }) {
  return <div className="space-y-1">
    <div role="radiogroup" aria-label={question.prompt} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" disabled={disabled} role="radio" aria-checked={draft.value === value} aria-label={`${value} of 5`}
        className={`${chip} w-9 justify-center px-0 ${draft.value === value ? chipOn : chipOff}`} onClick={() => onChange({ value })}>{value}</button>)}
    </div>
    {question.low_label || question.high_label ? <div className="flex w-[13.5rem] justify-between text-[11px] text-muted-foreground"><span>{question.low_label}</span><span>{question.high_label}</span></div> : null}
  </div>
}

/**
 * Coach's structured questions, answered all at once. It renders the same anywhere a surface
 * asks (the Coach chat today); the surface decides what happens with the answers.
 */
export default function QuestionSet({ questions, disabled = false, onSubmit }: {
  questions: HubQuestion[]
  disabled?: boolean
  // eslint-disable-next-line no-unused-vars
  onSubmit: (answers: HubQuestionAnswer[]) => Promise<void>
}) {
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [sending, setSending] = React.useState(false)
  if (!questions.length) return null

  // Answered: the answers read back as the learner's own message; here only what was saved, and where.
  if (questions.every((question) => question.status !== 'open')) {
    const saved = questions.filter((question) => question.kept?.saved && question.keep_label)
    return saved.length ? <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Saved from your answers">
      {saved.map((question) => <li key={question.question_uuid} className="flex items-center gap-1.5"><Check size={12} aria-hidden="true" />{question.keep_label}: {answerText(question)}</li>)}
    </ul> : null
  }

  const set = (question: HubQuestion, next: Draft) => setDrafts((current) => ({ ...current, [question.question_uuid]: next }))
  const ready = questions.every((question) => answered(question, drafts[question.question_uuid]))
  const busy = disabled || sending
  const send = async () => {
    setSending(true)
    try {
      await onSubmit(questions.map((question) => ({ question_uuid: question.question_uuid, ...drafts[question.question_uuid] })))
    } finally {
      setSending(false)
    }
  }

  return <form className="space-y-4 rounded-2xl border border-border/70 bg-card/40 px-4 py-3" aria-label="Coach’s questions" onSubmit={(event) => { event.preventDefault(); if (ready && !busy) void send() }}>
    {questions.map((question) => {
      const draft = drafts[question.question_uuid] || {}
      const skipped = Boolean(draft.skipped)
      return <fieldset key={question.question_uuid} className="space-y-2">
        <legend className="text-sm font-semibold">{question.prompt}</legend>
        {question.keep_label ? <p className="text-[11px] text-muted-foreground">{question.keep_label}</p> : null}
        <div className={skipped ? 'opacity-40' : undefined}>
          {question.kind === 'text'
            ? <Input aria-label={question.prompt} value={draft.text || ''} maxLength={1000} disabled={busy || skipped} onChange={(event) => set(question, { text: event.target.value })} className="h-9 text-sm" />
            : question.kind === 'scale'
              ? <Scale question={question} draft={draft} disabled={busy || skipped} onChange={(next) => set(question, next)} />
              : <Choices question={question} draft={draft} disabled={busy || skipped} onChange={(next) => set(question, next)} />}
        </div>
        {question.allow_skip ? <button type="button" disabled={busy} aria-pressed={skipped} aria-label={`Skip: ${question.prompt}`} onClick={() => set(question, skipped ? {} : { skipped: true })}
          className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{skipped ? 'Answer this' : 'Skip'}</button> : null}
      </fieldset>
    })}
    <Button type="submit" size="sm" className="h-8 text-xs" disabled={!ready || busy}>{sending ? <Loader2 size={13} className="animate-spin" /> : null}Send answers</Button>
  </form>
}
