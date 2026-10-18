'use client'

import React from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import type { CoachTestRun, CoachTestScore, CoachTestSide } from '@services/coach/admin'

const pct = ([passed, total]: [number, number]) => (total ? `${passed}/${total}` : '–')

/** One line per version: musts and shoulds passed across every test and run. */
export function RunScores({ run }: { run: CoachTestRun }) {
  const { draft, live } = run.summary
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {draft ? <Score label="Draft" score={draft} /> : null}
        {live ? <Score label={`Live release ${run.live_number}`} score={live} /> : null}
      </div>
      {draft && !live ? <p className="text-xs text-gray-500">The draft was the same as the live release, so only the draft ran.</p> : null}
      {draft?.failed_musts.length ? (
        <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle size={15} />The draft missed {draft.failed_musts.length === 1 ? 'a must' : `${draft.failed_musts.length} musts`}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {draft.failed_musts.map((item, index) => <li key={index}>{item.test}: {item.line} ({item.passed} of {item.total} responses)</li>)}
          </ul>
          <p className="mt-1 text-xs">You can still release. Musts are the lines you marked as rules.</p>
        </div>
      ) : null}
    </div>
  )
}

function Score({ label, score }: { label: string; score: CoachTestScore }) {
  const clean = score.must[0] === score.must[1]
  return (
    <div className="rounded-xl border border-black/10 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">
        <span className={`font-black ${clean ? 'text-emerald-700' : 'text-amber-700'}`}>Musts {pct(score.must)}</span>
        <span className="mx-2 text-gray-300">·</span>
        <span className="font-semibold">Shoulds {pct(score.should)}</span>
      </p>
    </div>
  )
}

/** Short form for a release card. */
export function RunBadge({ run }: { run: CoachTestRun }) {
  const draft = run.summary.draft
  if (!draft) return null
  const clean = draft.must[0] === draft.must[1]
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${clean ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
      Tests: musts {pct(draft.must)}, shoulds {pct(draft.should)}
    </span>
  )
}

/** Every test's rubric lines with how often each version met them, and the responses with the judge's evidence. */
export function RunDetails({ run }: { run: CoachTestRun }) {
  return (
    <ol aria-label="Results by test" className="space-y-3">
      {(run.results ?? []).map((result) => (
        <li key={result.test_uuid} className="rounded-xl border border-black/10 p-4">
          <p className="text-sm font-bold text-gray-950">{result.title}</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500"><th className="py-1 font-semibold">Rubric line</th><th className="w-20 py-1 font-semibold">Draft</th>{result.sides.live ? <th className="w-20 py-1 font-semibold">Live</th> : null}</tr>
            </thead>
            <tbody>
              {result.rubric.map((line) => (
                <tr key={line.id} className="border-t border-black/5 align-top">
                  <td className="py-1.5 pr-2"><span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${line.kind === 'must' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>{line.kind}</span>{line.text}</td>
                  <td className="py-1.5"><Tally side={result.sides.draft} id={line.id} /></td>
                  {result.sides.live ? <td className="py-1.5"><Tally side={result.sides.live} id={line.id} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-gray-600">Responses and evidence</summary>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {(['draft', 'live'] as const).map((key) => result.sides[key] ? (
                <div key={key} className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{key === 'draft' ? 'Draft' : `Live release ${run.live_number}`}</p>
                  {result.sides[key]!.samples.map((sample, index) => (
                    <div key={index} className="rounded-lg bg-gray-50 p-3 text-sm">
                      {sample.error ? <p className="text-red-700">This response failed: {sample.error}</p> : <p className="whitespace-pre-wrap text-gray-900">{sample.response}</p>}
                      <ul className="mt-2 space-y-1">
                        {sample.checks.map((check) => {
                          const line = result.rubric.find((item) => item.id === check.id)
                          return <li key={check.id} className="flex gap-2 text-xs text-gray-600">{check.pass ? <Check size={14} className="shrink-0 text-emerald-600" aria-label="Met" /> : <X size={14} className="shrink-0 text-red-600" aria-label="Missed" />}<span><span className="font-semibold text-gray-800">{line?.text}</span> · {check.evidence}</span></li>
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null)}
            </div>
          </details>
        </li>
      ))}
    </ol>
  )
}

function Tally({ side, id }: { side?: CoachTestSide; id: string }) {
  const [passed, total] = side?.lines[id] ?? [0, 0]
  if (!total) return <span className="text-gray-400">–</span>
  return <span className={`font-bold ${passed === total ? 'text-emerald-700' : passed === 0 ? 'text-red-700' : 'text-amber-700'}`}>{passed}/{total}</span>
}
