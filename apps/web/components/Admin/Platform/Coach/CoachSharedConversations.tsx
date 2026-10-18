'use client'

import React from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { FlaskConical, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { formatDateTime } from '@components/Admin/Platform/shared'
import { COACH_POLICY_PATH, coachAdminApi, type CoachSharedConversation, type CoachTestWrite } from '@services/coach/admin'
import { Panel, errorMessage } from './CoachShell'

/** Conversations learners chose to share, without their names; each can start a conversation test. */
export default function CoachSharedConversations({ token, onMakeTest }: {
  token?: string
  // eslint-disable-next-line no-unused-vars
  onMakeTest: (_draft: CoachTestWrite) => void
}) {
  const { data, mutate } = useSWR<CoachSharedConversation[]>(token ? [`${COACH_POLICY_PATH}/shared`, token] : null, () => coachAdminApi.shared(token))

  async function dismiss(item: CoachSharedConversation) {
    if (!window.confirm('Remove this shared conversation? The learner can share it again.')) return
    try {
      await coachAdminApi.dismissShared(item.share_uuid, token)
      await mutate()
    } catch (reason) {
      toast.error(errorMessage(reason, 'Could not remove it.'))
    }
  }

  return (
    <Panel title="Shared by learners" description="Conversations learners chose to share with the coaching team, without their names. Turn one into a conversation test: another model plays the learner from the persona you finish.">
      {!data ? <p role="status" className="text-sm text-gray-500">Loading…</p> : !data.length ? <p className="text-sm text-gray-500">No learner has shared a conversation yet. Learners share one from the Coach conversation menu.</p> : (
        <ol className="space-y-3">
          {data.map((item) => (
            <li key={item.share_uuid} className="rounded-xl border border-black/10 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">Shared {formatDateTime(item.shared_at)}{item.learner.headline ? ` · ${item.learner.headline}` : ''}</p>
                  {item.note ? <p className="mt-1 text-sm text-gray-800">“{item.note}”</p> : null}
                </div>
                <Button type="button" size="sm" onClick={() => onMakeTest(item.draft_test)}><FlaskConical size={14} />Make a test</Button>
                <Button type="button" variant="ghost" size="sm" aria-label="Remove shared conversation" onClick={() => void dismiss(item)}><Trash2 size={14} /></Button>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-gray-600">{item.messages.length} messages</summary>
                <div className="mt-2 space-y-2">
                  {item.messages.map((message, index) => (
                    <p key={index} className={`whitespace-pre-wrap rounded-lg p-2 ${message.role === 'user' ? 'bg-violet-50' : 'bg-gray-50'}`}><span className="font-semibold">{message.role === 'user' ? 'Learner' : 'Coach'}:</span> {message.content}</p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
