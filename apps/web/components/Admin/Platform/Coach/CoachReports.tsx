'use client'

import React from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { Check, FlaskConical } from 'lucide-react'
import { Button } from '@components/ui/button'
import { formatDateTime } from '@components/Admin/Platform/shared'
import { COACH_POLICY_PATH, coachAdminApi, type CoachReport, type CoachTestWrite } from '@services/coach/admin'
import { Panel, errorMessage } from './CoachShell'

/** Coach replies learners reported, without their names; each can start a test. */
export default function CoachReports({ token, onMakeTest }: {
  token?: string
  // eslint-disable-next-line no-unused-vars
  onMakeTest: (_draft: CoachTestWrite) => void
}) {
  const { data, mutate } = useSWR<CoachReport[]>(token ? [`${COACH_POLICY_PATH}/reports`, token] : null, () => coachAdminApi.reports(token))
  const fresh = data?.filter((item) => item.status === 'new').length ?? 0

  async function review(item: CoachReport) {
    try {
      await coachAdminApi.reviewReport(item.report_uuid, token)
      await mutate()
    } catch (reason) {
      toast.error(errorMessage(reason, 'Could not mark it reviewed.'))
    }
  }

  return (
    <Panel
      title={fresh ? `Reports (${fresh} new)` : 'Reports'}
      description="Coach replies learners reported, with the conversation up to that reply and what Coach knew, without their names. Turn one into a test to catch it next time; take out names and anything else that could identify the learner before you save."
    >
      {!data ? <p role="status" className="text-sm text-gray-500">Loading…</p> : !data.length ? <p className="text-sm text-gray-500">No learner has reported a reply yet. Learners report one with the flag under any Coach reply.</p> : (
        <ol className="space-y-3" aria-label="Reports">
          {data.map((item) => (
            <li key={item.report_uuid} className={`rounded-xl border border-black/10 p-4 ${item.status === 'reviewed' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-950">
                    {item.reason_label}
                    {item.status === 'new' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">New</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">Reviewed</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Reported {formatDateTime(item.created_at)}{item.learner.headline ? ` · ${item.learner.headline}` : ''}</p>
                  {item.note ? <p className="mt-1 text-sm text-gray-800">“{item.note}”</p> : null}
                </div>
                <Button type="button" size="sm" onClick={() => onMakeTest(item.draft_test)}><FlaskConical size={14} />Make a test</Button>
                {item.status === 'new' ? <Button type="button" variant="outline" size="sm" onClick={() => void review(item)}><Check size={14} />Mark reviewed</Button> : null}
              </div>
              <details className="mt-2 text-sm" open={item.status === 'new'}>
                <summary className="cursor-pointer text-xs font-semibold text-gray-600">Conversation up to the reported reply ({item.messages.length} messages)</summary>
                <div className="mt-2 space-y-2">
                  {item.messages.map((message, index) => {
                    const reported = index === item.messages.length - 1
                    return (
                      <div key={index} className={`whitespace-pre-wrap rounded-lg p-2 ${reported ? 'border border-amber-300 bg-amber-50' : message.role === 'user' ? 'bg-violet-50' : 'bg-gray-50'}`}>
                        {reported ? <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">Reported reply</p> : null}
                        <span className="font-semibold">{message.role === 'user' ? 'Learner' : 'Coach'}:</span> {message.content}
                      </div>
                    )
                  })}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
