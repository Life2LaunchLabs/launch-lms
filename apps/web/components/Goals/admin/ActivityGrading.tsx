'use client'

import React from 'react'
import { Check, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findQuestionBlocks, getBlockScoring } from '@components/Learning/schema'

export function ActivityGradeForm({ response, scores, setScores, feedback, setFeedback, saving, onConfirm }: { response: any; scores: Record<string, string>; setScores: React.Dispatch<React.SetStateAction<Record<string, string>>>; feedback: string; setFeedback: React.Dispatch<React.SetStateAction<string>>; saving: boolean; onConfirm: () => void }) {
  const questions = findQuestionBlocks(response.page || {}) as any[]
  const results = response.result?.questions || {}
  const pending = questions.filter((question) => results[String(question.id)]?.grading_status === 'pending')
  const autoResults = Object.entries(results).filter(([, item]: any) => item.grading_status !== 'pending')
  const autoScore = autoResults.reduce((sum, [, item]: any) => sum + Number(item.score || 0), 0)
  const autoMax = autoResults.reduce((sum, [, item]: any) => sum + Number(item.max_score ?? item.points ?? 0), 0)
  const manualScore = pending.reduce((sum, question) => sum + Number(scores[String(question.id)] || 0), 0)
  const manualMax = pending.reduce((sum, question) => sum + Number(results[String(question.id)]?.max_score ?? getBlockScoring(question)?.points ?? 0), 0)
  const total = autoScore + manualScore
  const max = autoMax + manualMax
  const percent = max ? Math.round((total / max) * 1000) / 10 : 100
  const minimum = Number(response.activity?.settings?.grading?.minimum_score_percent ?? 70)
  const pass = percent >= minimum

  return <div className="grid gap-6 p-2 lg:grid-cols-[minmax(0,1fr)_220px]">
    <div className="space-y-5">{pending.map((question, index) => {
      const id = String(question.id)
      const result = results[id] || {}
      const scoring = getBlockScoring(question) || {}
      const maxScore = Number(result.max_score ?? result.points ?? scoring.points ?? 0)
      const answer = result.inputs || response.answer?.questions?.[id]?.inputs || {}
      return <section key={id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Question {index + 1}</p><h3 className="mt-1 text-sm font-black text-gray-900">{question.content?.label || response.page?.title || 'Manual response'}</h3></div><span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-black text-gray-600">{maxScore} pts</span></div><div className="mt-4 space-y-2">{Object.entries(answer).map(([inputId, value]: any) => <div key={inputId} className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] font-black uppercase text-gray-400">{question.content?.inputs?.find((input: any) => input.id === inputId)?.label || inputId}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">{value?.text || value?.url || 'No response'}</p></div>)}</div><div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-black uppercase text-blue-600">Rubric</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-blue-950">{scoring.rubric || 'No rubric was provided.'}</p></div><label className="mt-4 block text-xs font-black text-gray-600">Points earned <span className="font-medium text-gray-400">(0–{maxScore})</span><input type="number" min={0} max={maxScore} step="any" value={scores[id] ?? ''} onChange={(event) => { const value = event.target.value; setScores((current) => ({ ...current, [id]: value === '' ? '' : String(Math.max(0, Math.min(maxScore, Number(value)))) })) }} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label></section>
    })}<label className="block text-xs font-bold text-gray-600">Instructor note <span className="font-medium text-gray-400">(optional)</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" /></label><button onClick={onConfirm} disabled={saving || Object.values(scores).some((value) => value === '')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm grading</button></div>
    <aside className="h-fit space-y-3 lg:sticky lg:top-4"><Score label="Other questions" value={`${autoScore}/${autoMax}`} /><Score label="Manual grading" value={`${manualScore}/${manualMax}`} /><Score label="Total score" value={`${total}/${max}`} strong /><div className={cn('rounded-xl p-4', pass ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900')}><p className="text-2xl font-black">{percent}%</p><p className="mt-1 text-xs font-bold">{pass ? 'Passing' : 'Below passing'} · {minimum}% required</p></div></aside>
  </div>
}

export function ActivityAggregateGradeForm({ review, scores, setScores, feedback, setFeedback, saving, onConfirm }: { review: any; scores: Record<string, string>; setScores: React.Dispatch<React.SetStateAction<Record<string, string>>>; feedback: string; setFeedback: React.Dispatch<React.SetStateAction<string>>; saving: boolean; onConfirm: CallableFunction }) {
  const attempts = React.useMemo(() => buildAdminActivityAttempts(review), [review])
  const [questionFeedback, setQuestionFeedback] = React.useState<Record<string, string>>({})
  const [selected, setSelected] = React.useState(Math.max(0, attempts.length - 1))
  React.useEffect(() => { setSelected(Math.max(0, attempts.length - 1)); setQuestionFeedback({}) }, [attempts.length, review.review_id])
  const activeAttempt = attempts[selected] || attempts.at(-1)
  const questions = (review.attempts || []).flatMap((attempt: any) => {
    const blocks = findQuestionBlocks(attempt.page || {}) as any[]
    return blocks.filter((question) => attempt.result?.questions?.[String(question.id)]?.grading_status === 'pending').map((question) => ({ attempt, question, result: attempt.result.questions[String(question.id)], key: `${attempt.attempt_uuid}:${question.id}` }))
  })
  const ungradedCount = questions.filter((item: any) => scores[item.key] === '').length
  const manualScore = questions.reduce((sum: number, item: any) => sum + Number(scores[item.key] || 0), 0)
  const total = Number(review.auto_score || 0) + manualScore
  const max = Number(review.max_score || 0)
  const percent = max ? Math.round((total / max) * 1000) / 10 : 100
  const minimum = Number(review.minimum_score_percent ?? 70)
  const pass = percent >= minimum
  const bestIndex = attempts.reduce((best, item, index) => !item.pending && Number(item.percent ?? -1) > Number(attempts[best]?.percent ?? -1) ? index : best, -1)
  return <div className="p-2">
    {attempts.length > 1 ? <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 pb-3">{attempts.map((attempt: any, index: number) => <button key={attempt.key} type="button" onClick={() => setSelected(index)} className={cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold', selected === index ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-100')}><span>Attempt {index + 1}</span><span className={cn('rounded-md px-1.5 py-0.5 text-[10px]', selected === index ? 'bg-white/15' : 'bg-gray-100 text-gray-800', index === bestIndex && 'shadow-[0_0_14px_rgba(132,204,22,0.5)] ring-1 ring-lime-300')}>{attempt.pending ? '?' : `${attempt.percent}%`}</span>{index === bestIndex ? <Sparkles size={11} className="text-lime-500" /> : null}</button>)}</div> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div>{activeAttempt ? <><p className="mb-4 text-[11px] font-semibold text-gray-400">Submitted {formatReviewDate(activeAttempt.submittedAt)}</p>{activeAttempt.activityNotes?.length ? <div className="mb-4 space-y-2">{activeAttempt.activityNotes.map((note: any, index: number) => <div key={`${note.message}-${index}`} className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Activity note{note.grader ? ` · ${note.grader}` : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{note.message}</p></div>)}</div> : null}<div className="space-y-3">{activeAttempt.questions.map((item: any, index: number) => {
        const fullMarks = !item.pending && item.max > 0 && item.score >= item.max
        return <section key={item.key} className={fullMarks ? 'rounded-xl bg-gray-50 px-4 py-3' : 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm'}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Question {index + 1} · {item.pageTitle}</p><h3 className="mt-1 text-sm font-black text-gray-900">{item.title}</h3></div>{item.pending ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">Needs grading</span> : <span className={cn('rounded-lg px-2 py-1 text-xs font-black', fullMarks ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800')}>{item.score}/{item.max}</span>}</div><AdminAnswerDisplay item={item} fullMarks={fullMarks} />{item.pending ? <><div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-black uppercase text-blue-600">Rubric</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-blue-950">{item.rubric || 'No rubric was provided.'}</p></div><div className="mt-4 grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]"><label className="block text-xs font-black text-gray-600">Points earned <span className="font-medium text-gray-400">(0–{item.max})</span><input type="number" min={0} max={item.max} step="any" value={scores[item.key] ?? ''} onChange={(event) => { const value = event.target.value; setScores((current) => ({ ...current, [item.key]: value === '' ? '' : String(Math.max(0, Math.min(item.max, Number(value)))) })) }} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label><label className="block text-xs font-black text-gray-600">Question note <span className="font-medium text-gray-400">(optional)</span><textarea value={questionFeedback[item.key] ?? ''} onChange={(event) => setQuestionFeedback((current) => ({ ...current, [item.key]: event.target.value }))} className="mt-2 min-h-20 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Feedback specific to this answer" /></label></div></> : item.feedback ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"><p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Question note</p><p className="mt-1 whitespace-pre-wrap">{item.feedback}</p></div> : null}</section>
      })}</div></> : <p className="py-12 text-center text-sm text-gray-400">No submission details available.</p>}</div>
      <aside className="h-fit space-y-4 lg:sticky lg:top-4"><div className={cn('rounded-xl border p-4', ungradedCount ? 'border-blue-200 bg-blue-50 text-blue-950' : pass ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>{ungradedCount ? <><p className="text-2xl font-black">{ungradedCount}</p><p className="mt-1 text-xs font-bold">question{ungradedCount === 1 ? '' : 's'} need grading</p></> : <><p className="text-xs font-bold">Final score</p><p className="mt-1 text-3xl font-black">{percent}%</p><p className="mt-1 text-xs font-bold">{pass ? 'Passing' : 'Below passing'} · {minimum}% required</p></>}</div><label className="block text-xs font-bold text-gray-600">Activity note <span className="font-medium text-gray-400">(optional)</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Feedback about the activity as a whole" /></label><button onClick={() => onConfirm(questionFeedback)} disabled={saving || ungradedCount > 0} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm grading</button></aside>
    </div>
  </div>
}

function buildAdminActivityAttempts(review: any) {
  const history = review.attempt_history?.length ? review.attempt_history : review.attempts || []
  const byPage = new Map<string, any[]>()
  for (const attempt of history) {
    const pageUuid = attempt.page?.page_uuid || String(attempt.page_id)
    const items = byPage.get(pageUuid) || []
    items.push(attempt)
    byPage.set(pageUuid, items)
  }
  for (const items of byPage.values()) items.sort((left, right) => new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime())
  const count = Math.max(0, ...Array.from(byPage.values()).map((items) => items.length))
  return Array.from({ length: count }, (_, attemptIndex) => {
    const selected = Array.from(byPage.values()).map((items) => items[Math.min(attemptIndex, items.length - 1)])
    const questions = selected.flatMap((attempt: any) => {
      const blocks = findQuestionBlocks(attempt.page || {}) as any[]
      const results = attempt.result?.questions || {}
      const rows = Object.entries(results).filter(([, result]: any) => ['graded', 'pending'].includes(result?.grading_status)).map(([id, result]: any, index) => {
        const question = blocks.find((block: any) => String(block.id) === String(id))
        const answer = attempt.answer?.questions?.[id] || (blocks.length === 1 ? attempt.answer : {}) || {}
        const scoring = getBlockScoring(question) || {}
        return adminQuestion(attempt, question, result, answer, `${attempt.attempt_uuid}:${id}`, index, scoring)
      })
      if (rows.length) return rows
      if (!Number(attempt.result?.max_score || 0) || !blocks[0]) return []
      return [adminQuestion(attempt, blocks[0], attempt.result, attempt.answer || {}, attempt.attempt_uuid, 0, getBlockScoring(blocks[0]) || {})]
    })
    const pending = questions.some((item: any) => item.pending)
    const score = questions.reduce((total: number, item: any) => total + Number(item.score || 0), 0)
    const max = questions.reduce((total: number, item: any) => total + Number(item.max || 0), 0)
    const submittedAt = selected.reduce((latest, attempt) => new Date(attempt.submitted_at).getTime() > new Date(latest).getTime() ? attempt.submitted_at : latest, selected[0]?.submitted_at || '')
    const activityNotes = uniqueReviewNotes(selected)
    return { key: `attempt-${attemptIndex}`, questions, activityNotes, pending, percent: pending ? null : max ? Math.round((score / max) * 100) : 0, submittedAt }
  })
}

function adminQuestion(attempt: any, question: any, result: any, answer: any, key: string, index: number, scoring: any) {
  return {
    key,
    pageTitle: attempt.page?.title || 'Activity',
    title: question?.content?.label || attempt.page?.title || `Question ${index + 1}`,
    kind: result?.kind || question?.kind,
    pending: result?.grading_status === 'pending',
    score: Number(result?.score || 0),
    max: Number(result?.max_score ?? result?.points ?? scoring?.points ?? 0),
    rubric: scoring?.rubric || '',
    feedback: result?.feedback || '',
    options: adminQuestionOptions(question, answer, result),
    selectedIds: result?.option_ids || result?.selected || answer?.option_ids || (answer?.option_id ? [answer.option_id] : []),
    correctIds: result?.correct_option_ids || [],
    responseText: Object.values(result?.inputs || answer?.inputs || {}).map((value: any) => value?.text ?? value?.value ?? '').filter(Boolean).join('\n\n'),
  }
}

function uniqueReviewNotes(attempts: any[]) {
  const notes = new Map<string, any>()
  for (const attempt of attempts) {
    const message = String(attempt.result?.feedback || '').trim()
    if (!message) continue
    const grader = attempt.result?.graded_by || {}
    const key = `${message}:${grader.user_id || ''}:${grader.org_id || ''}`
    if (!notes.has(key)) notes.set(key, { message, grader: [grader.staff_name, grader.org_name].filter(Boolean).join(' · ') })
  }
  return Array.from(notes.values())
}

function adminQuestionOptions(question: any, answer: any, result: any) {
  const configured = (question?.content?.options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? index), text: option.text || option.label || `Option ${index + 1}` }))
  const custom = (answer?.custom_options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? `custom-${index}`), text: option.text || option.label || option.value || `Option ${configured.length + index + 1}` }))
  const options = [...configured, ...custom]
  const known = new Set(options.map((option) => option.id))
  for (const id of [...(result?.option_ids || result?.selected || []), ...(result?.correct_option_ids || [])].map(String)) if (!known.has(id)) options.push({ id, text: id })
  return options
}

function AdminAnswerDisplay({ item, fullMarks }: { item: any; fullMarks: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  if (item.kind === 'multiple_choice' || item.kind === 'categorized_multi_select') {
    const selected = new Set((item.selectedIds || []).map(String))
    const correct = new Set((item.correctIds || []).map(String))
    return <div className="mt-4 space-y-2">{item.options.map((option: any) => { const chosen = selected.has(String(option.id)); const right = chosen && (correct.size ? correct.has(String(option.id)) : fullMarks); return <div key={option.id} className={cn('flex min-h-11 items-center justify-between rounded-lg border px-3 py-2.5 text-sm', chosen ? item.pending ? '-translate-y-0.5 border-blue-300 bg-white text-gray-900 shadow-sm' : right ? '-translate-y-0.5 border-green-400 bg-white text-green-950 shadow-sm' : '-translate-y-0.5 border-red-400 bg-white text-red-950 shadow-sm' : 'border-transparent bg-gray-50 text-gray-400')}><span>{option.text}</span>{chosen && !item.pending ? <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', right ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{right ? <Check size={13} /> : <X size={13} />}</span> : null}</div> })}</div>
  }
  if (item.kind === 'text_input' && item.responseText) {
    const long = item.responseText.length > 420
    return <div className="mt-4 rounded-lg bg-gray-50 p-3"><p className={cn('whitespace-pre-wrap text-sm leading-6 text-gray-800', long && !expanded && 'line-clamp-6')}>{item.responseText}</p>{long ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-xs font-bold text-gray-500 hover:text-gray-900">{expanded ? 'Show less' : 'Read full response'}</button> : null}</div>
  }
  return null
}

function formatReviewDate(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

function Score({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={cn('rounded-xl border border-gray-200 bg-white p-4', strong && 'border-blue-200 bg-blue-50')}><p className="text-xs font-bold text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-gray-900">{value}</p></div> }
