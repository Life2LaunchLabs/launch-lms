'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import { Check, ChevronDown, Eye, ListChecks, Plus, TextCursorInput, Upload, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { findQuestionBlocks, getBlockCompletion, getBlockScoring } from '@components/Learning/schema'
import { pageHeading } from './PageRail'
import type { ServedPageTemplates } from '@services/learning/pageTemplates'
import { PAGE_TEMPLATES, fromServed, type PageDraft } from './pageTemplates'
import { Toggle } from './EditorDialogs'

// Grading: every question pulled out of its page, in route order, with the
// activity's rules first. Clicking a card selects it; the selected card shows
// its own toolbar, and right answers are set by clicking them on the card.

type Count = 'auto' | 'accepted' | 'review' | 'complete' | 'off'
type Question = { page: any; number: number; block: any }

const COUNTS: Record<string, Array<{ value: Count; label: string; help: string }>> = {
  choice: [
    { value: 'auto', label: 'Check the answer', help: 'Points for the right answer. They see feedback right away.' },
    { value: 'complete', label: 'Counts when answered', help: 'No right answer. Good for opinions.' },
    { value: 'off', label: 'Not graded', help: "Doesn't count." },
  ],
  text: [
    { value: 'accepted', label: 'Check for key words', help: 'Points if the answer includes any of your words.' },
    { value: 'review', label: 'Staff review', help: 'A person reads it and marks it.' },
    { value: 'complete', label: 'Counts when answered', help: 'Any answer is fine.' },
    { value: 'off', label: 'Not graded', help: "Doesn't count." },
  ],
  upload: [
    { value: 'review', label: 'Staff review', help: 'A person looks at it and marks it.' },
    { value: 'complete', label: 'Counts when uploaded', help: 'Any upload is fine.' },
    { value: 'off', label: 'Not graded', help: "Doesn't count." },
  ],
}

const ADD: Array<{ template: keyof ServedPageTemplates['defaults']; label: string; icon: typeof ListChecks }> = [
  { template: 'quick_check', label: 'Choice with a right answer', icon: ListChecks },
  { template: 'pick_few', label: 'Pick a few', icon: ListChecks },
  { template: 'short_answer', label: 'Written answer', icon: TextCursorInput },
  { template: 'show_work', label: 'Upload for staff review', icon: Upload },
]

const family = (block: any) => block.kind === 'text_input' ? 'text' : block.kind === 'image_upload' ? 'upload' : 'choice'

export function countOf(block: any): Count {
  const scoring = getBlockScoring(block) || {}
  const kind = family(block)
  if (scoring.mode === 'off') return 'off'
  if (scoring.mode === 'completion') return 'complete'
  if (kind === 'choice') return scoring.mode === 'points' || scoring.correct_option_ids?.length ? 'auto' : 'off'
  if (kind === 'text') return scoring.mode === 'manual' ? 'review' : scoring.mode === 'accepted_answers' || scoring.accepted_answers?.length ? 'accepted' : 'off'
  return 'review'
}

export function questionPoints(block: any): number {
  const count = countOf(block)
  if (count === 'off' || count === 'complete') return 0
  const inputs = Object.values(getBlockCompletion(block)?.inputs || {}).filter((rule: any) => rule?.points != null) as any[]
  if (block.kind === 'text_input' && inputs.length) return inputs.reduce((sum, rule) => sum + (Number(rule.points) || 0), 0)
  return Math.max(0, Number(getBlockScoring(block)?.points ?? 1) || 0)
}

function isRequired(block: any): boolean {
  const completion = getBlockCompletion(block) || {}
  if (block.kind === 'text_input') return Object.values(completion.inputs || {}).some((rule: any) => rule?.required)
  if (block.kind === 'image_upload') return completion.required !== false
  return Number(completion.min_selections ?? 1) > 0
}

function withRequired(block: any, required: boolean) {
  const completion = getBlockCompletion(block) || {}
  if (block.kind === 'text_input') {
    const inputs = Object.fromEntries((block.content?.inputs || []).map((input: any) => [input.id, { ...(completion.inputs?.[input.id] || {}), required }]))
    return { completion: { ...completion, inputs } }
  }
  if (block.kind === 'image_upload') return { completion: { ...completion, required } }
  return { completion: { ...completion, min_selections: required ? Math.max(1, Number(completion.min_selections) || 1) : 0 } }
}

/** The scoring and completion for a new "how it counts", keeping what can carry over. */
function withCount(block: any, count: Count) {
  const scoring = getBlockScoring(block) || {}
  const points = Math.max(1, Number(scoring.points) || 0) || 1
  const options: any[] = block.content?.options || []
  const completion = getBlockCompletion(block) || {}
  // Points move to the question; per-input points would otherwise override them.
  const inputs = completion.inputs ? Object.fromEntries(Object.entries(completion.inputs).map(([id, rule]: any) => [id, { ...rule, points: undefined }])) : undefined
  const base = { ...scoring, points: count === 'off' || count === 'complete' ? 0 : points }
  const next = count === 'auto' ? { ...base, mode: 'points', correct_option_ids: scoring.correct_option_ids?.length ? scoring.correct_option_ids : options.slice(0, 1).map((option) => option.id) }
    : count === 'accepted' ? { ...base, mode: 'accepted_answers', match: 'contains', accepted_answers: scoring.accepted_answers || [] }
      : count === 'review' ? { ...base, mode: 'manual' }
        : count === 'complete' ? { ...base, mode: 'completion' }
          : { ...base, mode: 'off' }
  return { scoring: next, ...(inputs ? { completion: { ...completion, inputs } } : {}) }
}

export function gradingQuestions(pages: any[], pageOrder: string[]): Question[] {
  const byUuid = new Map(pages.map((page) => [page.page_uuid, page]))
  return pageOrder.flatMap((uuid, index) => {
    const page = byUuid.get(uuid)
    return page ? findQuestionBlocks(page).map((block: any) => ({ page, number: index + 1, block })) : []
  })
}

export function GradingView({ pages, pageOrder, grading, defaults, onPatchGrading, onPatchBlock, onAddQuestion, onShowOnPage }: {
  pages: any[]
  /** Add question's published defaults (the page templates plan); missing picks use the built-in page. */
  defaults?: ServedPageTemplates['defaults']
  pageOrder: string[]
  grading: any
  onPatchGrading: (patch: any) => void
  onPatchBlock: (pageUuid: string, blockId: string, patch: any) => void
  onAddQuestion: (draft: PageDraft) => void
  onShowOnPage: (pageUuid: string, blockId: string) => void
}) {
  const questions = gradingQuestions(pages, pageOrder)
  const [selected, setSelected] = React.useState<string | null>(null)
  const total = questions.reduce((sum, item) => sum + questionPoints(item.block), 0)
  const passing = grading.finish !== 'complete' && total > 0
  const passAt = Number(grading.minimum_score_percent ?? 70)
  const review = questions.filter((item) => countOf(item.block) === 'review').length

  return (
    <div className="h-full overflow-y-auto bg-gray-100" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
      <div className="mx-auto grid max-w-3xl gap-3 px-6 pb-24 pt-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
          <h2 className="text-xl font-extrabold tracking-tight">Grading</h2>
          <span className="text-sm font-semibold text-gray-500">
            {questions.length} question{questions.length === 1 ? '' : 's'} · {total} point{total === 1 ? '' : 's'} · {passing ? `pass at ${Math.ceil((total * passAt) / 100)}` : 'no pass mark'}
          </span>
        </div>
        <RulesCard grading={grading} total={total} review={review} onPatch={onPatchGrading} />
        {questions.map((item, index) => {
          const key = `${item.page.page_uuid}:${item.block.id}`
          const firstOnPage = index === 0 || questions[index - 1].page.page_uuid !== item.page.page_uuid
          return (
            <React.Fragment key={key}>
              {firstOnPage && <div className="px-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Page {item.number}</div>}
              <QuestionCard
                item={item}
                selected={selected === key}
                onSelect={() => setSelected(key)}
                onPatch={(patch) => onPatchBlock(item.page.page_uuid, item.block.id, patch)}
                onShowOnPage={() => onShowOnPage(item.page.page_uuid, item.block.id)}
              />
            </React.Fragment>
          )
        })}
        {!questions.length && <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm text-gray-500">No questions yet. Add one and it gets its own page.</p>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="mt-1 inline-flex h-10 items-center gap-2 justify-self-start rounded-xl border border-dashed border-gray-300 px-4 text-sm font-bold text-gray-600 hover:border-gray-400 hover:bg-white">
              <Plus size={15} /> Add question
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ADD.map(({ template, label, icon: Icon }) => {
              // The published default for this kind of question, else the built-in one.
              const served = defaults?.[template]
              const found = PAGE_TEMPLATES.find((item) => item.id === template)
              const make = served ? () => fromServed(served) : found?.make
              return make ? <DropdownMenuItem key={template} onSelect={() => onAddQuestion(make())}><Icon size={14} className="mr-2" />{label}</DropdownMenuItem> : null
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function Radios({ value, options, onChange, label }: { value: string; options: Array<{ value: string; label: string; help?: string }>; onChange: (value: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className="grid grid-cols-[18px_1fr] gap-x-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-bold hover:bg-gray-50">
          <span className={`mt-0.5 h-4 w-4 rounded-full border-2 ${value === option.value ? 'border-[5px] border-sky-600' : 'border-gray-300'}`} />
          <span>{option.label}{option.help && <small className="block text-xs font-medium text-gray-500">{option.help}</small>}</span>
        </button>
      ))}
    </div>
  )
}

function RulesCard({ grading, total, review, onPatch }: { grading: any; total: number; review: number; onPatch: (patch: any) => void }) {
  const finish = grading.finish === 'complete' ? 'complete' : 'pass'
  const passAt = Number(grading.minimum_score_percent ?? 70)
  return (
    <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm" aria-label="Activity rules">
      <div>
        <h3 className="text-base font-extrabold">Activity rules</h3>
        <p className="text-xs text-gray-500">How the whole activity is finished.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Finishing</p>
          <Radios label="Finishing" value={finish} onChange={(value) => onPatch({ finish: value })} options={[
            { value: 'complete', label: 'They finish it', help: 'Done once every required question is answered.' },
            { value: 'pass', label: 'They pass it', help: 'Points from graded questions, with a pass mark.' },
          ]} />
        </div>
        {finish === 'pass' && (
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Pass mark</span>
              <span className="flex items-center gap-3 text-sm font-extrabold">
                <input type="range" min={10} max={100} step={5} value={passAt} onChange={(event) => onPatch({ minimum_score_percent: Number(event.target.value) })} aria-label="Pass mark" className="flex-1 accent-sky-600" />
                {passAt}%
              </span>
              <span className="text-xs text-gray-500">{total ? `${Math.ceil((total * passAt) / 100)} of ${total} points.` : 'No questions have points yet, so they finish it.'}</span>
            </label>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">If they don&apos;t pass</p>
              <Radios label="If they don't pass" value={grading.if_not_passed || 'try_again'} onChange={(value) => onPatch({ if_not_passed: value })} options={[
                { value: 'try_again', label: 'Try again from the start' },
                { value: 'redo_missed', label: 'Redo the ones they missed' },
                { value: 'staff_decide', label: 'Staff decide', help: 'It waits in the review queue under Threads.' },
              ]} />
            </div>
          </div>
        )}
      </div>
      {finish === 'pass' && <Toggle label="Show their score at the end" checked={grading.show_score !== false} onChange={(show_score) => onPatch({ show_score })} />}
      {review > 0 && <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900">{review} answer{review === 1 ? ' goes' : 's go'} to staff review. They land in the review queue under Threads, and the step waits until someone marks them.</p>}
    </section>
  )
}

function QuestionCard({ item, selected, onSelect, onPatch, onShowOnPage }: { item: Question; selected: boolean; onSelect: () => void; onPatch: (patch: any) => void; onShowOnPage: () => void }) {
  const { block, page } = item
  const count = countOf(block)
  const scoring = getBlockScoring(block) || {}
  const points = questionPoints(block)
  const kind = family(block)
  const options: any[] = block.content?.options || []
  const right = new Set<string>((scoring.correct_option_ids || []).map(String))
  const multi = Number(getBlockCompletion(block)?.max_selections ?? 1) > 1
  const graded = count === 'auto' || count === 'accepted' || count === 'review'
  const toggleRight = (id: string) => {
    if (!selected || count !== 'auto') return
    const next = multi ? (right.has(id) ? [...right].filter((value) => value !== id) : [...right, id]) : [id]
    onPatch({ scoring: { ...scoring, correct_option_ids: next } })
  }
  const pill = count === 'review' ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800">Staff review · {points} {points === 1 ? 'pt' : 'pts'}</span>
    : graded ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-extrabold text-green-800">{points} {points === 1 ? 'pt' : 'pts'}</span>
      : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-extrabold text-gray-500">{count === 'complete' ? 'Counts when answered' : 'Not graded'}</span>

  return (
    <div role="button" tabIndex={0} aria-pressed={selected} onClick={onSelect} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } }}
      className={`grid gap-3 rounded-2xl border-2 bg-white text-left shadow-sm outline-none transition ${selected ? 'border-sky-500' : 'border-transparent hover:border-gray-200'} focus-visible:border-sky-400`}>
      {selected && (
        <div role="toolbar" aria-label="Question grading" className="flex flex-wrap items-center gap-2 rounded-t-[14px] border-b border-gray-100 bg-gray-50 px-3 py-2" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-bold">
                {COUNTS[kind].find((option) => option.value === count)?.label}<ChevronDown size={13} className="text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {COUNTS[kind].map((option) => (
                <DropdownMenuItem key={option.value} onSelect={() => onPatch(withCount(block, option.value))} className="flex flex-col items-start gap-0.5">
                  <span className="flex w-full items-center font-bold">{option.label}{option.value === count && <Check size={14} className="ml-auto text-sky-600" />}</span>
                  <span className="text-xs text-gray-500">{option.help}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {graded && (
            <span className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white">
              <button type="button" aria-label="Fewer points" onClick={() => onPatch({ scoring: { ...scoring, points: Math.max(0, points - 1) } })} className="h-full px-2 font-bold text-gray-600 hover:bg-gray-100">−</button>
              <input type="number" min={0} value={points} aria-label="Points" onChange={(event) => onPatch({ scoring: { ...scoring, points: Math.max(0, Number(event.target.value) || 0) } })} className="w-12 bg-transparent text-center text-sm font-extrabold outline-none [appearance:textfield]" />
              <button type="button" aria-label="More points" onClick={() => onPatch({ scoring: { ...scoring, points: points + 1 } })} className="h-full px-2 font-bold text-gray-600 hover:bg-gray-100">+</button>
            </span>
          )}
          {count === 'auto' && multi && (
            <span className="flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Scoring">
              <button type="button" aria-pressed={scoring.partial_credit === false} onClick={() => onPatch({ scoring: { ...scoring, partial_credit: false } })} className={`h-7 rounded-md px-2 text-xs font-bold ${scoring.partial_credit === false ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>All or nothing</button>
              <button type="button" aria-pressed={scoring.partial_credit !== false} onClick={() => onPatch({ scoring: { ...scoring, partial_credit: true } })} className={`h-7 rounded-md px-2 text-xs font-bold ${scoring.partial_credit !== false ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>Partial credit</button>
            </span>
          )}
          <label className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-bold">
            <input type="checkbox" checked={isRequired(block)} onChange={(event) => onPatch(withRequired(block, event.target.checked))} className="h-4 w-4 accent-sky-600" />
            Required
          </label>
          <button type="button" onClick={onShowOnPage} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-gray-600 hover:bg-gray-100"><Eye size={14} />See it on the page</button>
        </div>
      )}
      <div className={`grid gap-3 px-5 ${selected ? 'pb-5' : 'py-4'}`}>
        <div className="flex items-start gap-3">
          <b className="flex-1 text-base font-extrabold leading-snug tracking-tight">{pageHeading(page)}</b>
          {pill}
        </div>
        {kind === 'choice' && options.length > 0 && (
          <ul className="grid gap-0.5">
            {options.map((option) => {
              const on = count === 'auto' && right.has(String(option.id))
              return (
                <li key={option.id}>
                  <button type="button" disabled={!selected || count !== 'auto'} onClick={(event) => { event.stopPropagation(); toggleRight(String(option.id)) }}
                    aria-pressed={on} aria-label={`${option.text || option.label}${on ? ', right answer' : ''}`}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm disabled:cursor-default ${on ? 'font-bold text-gray-950' : 'text-gray-500'} ${selected && count === 'auto' ? 'hover:bg-gray-50' : ''}`}>
                    <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    {option.text || option.label}
                  </button>
                </li>
              )
            })}
            {selected && count === 'auto' && <li className="px-2 pt-1 text-xs text-gray-500">Click the right answer{multi ? 's' : ''}.</li>}
          </ul>
        )}
        {count === 'accepted' && <AcceptedWords selected={selected} words={scoring.accepted_answers || []} onChange={(accepted_answers) => onPatch({ scoring: { ...scoring, accepted_answers, match: 'contains' } })} />}
        {count === 'review' && (selected
          ? <Field label="Rubric for staff" value={scoring.rubric || ''} placeholder="What a good answer includes" onChange={(rubric) => onPatch({ scoring: { ...scoring, rubric } })} />
          : <p className="text-sm text-gray-500">{scoring.rubric ? <>Rubric: <span className="font-semibold text-gray-800">{scoring.rubric}</span></> : 'No rubric yet.'}</p>)}
        {(count === 'auto' || count === 'accepted') && (selected ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="When they get it right" value={scoring.feedback?.correct || ''} placeholder="Why it's right" onChange={(correct) => onPatch({ scoring: { ...scoring, feedback: { ...(scoring.feedback || {}), correct } } })} />
            <Field label="When they don't" value={scoring.feedback?.incorrect || ''} placeholder="A nudge toward the right answer" onChange={(incorrect) => onPatch({ scoring: { ...scoring, feedback: { ...(scoring.feedback || {}), incorrect } } })} />
          </div>
        ) : (scoring.feedback?.correct || scoring.feedback?.incorrect) ? <p className="text-sm text-gray-500">Feedback: <span className="font-semibold text-gray-800">{scoring.feedback?.correct || scoring.feedback?.incorrect}</span></p> : null)}
      </div>
    </div>
  )
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1" onClick={(event) => event.stopPropagation()}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={2} className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" />
    </label>
  )
}

function AcceptedWords({ selected, words, onChange }: { selected: boolean; words: string[]; onChange: (words: string[]) => void }) {
  const [draft, setDraft] = React.useState('')
  return (
    <div className="grid gap-2" onClick={(event) => event.stopPropagation()}>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        Right if it includes
        {words.length ? words.map((word, index) => (
          <span key={`${word}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
            {word}
            {selected && <button type="button" aria-label={`Remove ${word}`} onClick={() => onChange(words.filter((_, at) => at !== index))}><X size={11} /></button>}
          </span>
        )) : <em className="not-italic font-semibold text-gray-800">no words yet</em>}
      </p>
      {selected && (
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a word, then Enter" aria-label="Add a key word"
          onKeyDown={(event) => { if (event.key === 'Enter' && draft.trim()) { event.preventDefault(); onChange([...words, draft.trim()]); setDraft('') } }}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-sky-400" />
      )}
    </div>
  )
}
