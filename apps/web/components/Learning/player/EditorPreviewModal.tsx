'use client'

import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { buildActivityDocument, createLearningPreview } from '@services/learning/activityDocuments'
import { ActivityPreview } from './ActivityPreview'

// Previews exactly what is on screen in the editor (including edits that are
// still autosaving) through the same preview session and player used by
// shared preview links and the Claude connector.
export function EditorPreviewModal({ activity, pages, accessToken, onClose }: { activity: any; pages: any[]; accessToken?: string; onClose: () => void }) {
  const [token, setToken] = React.useState<string | null>(null)
  const [problems, setProblems] = React.useState<Array<{ path: string; message: string }> | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const documentRef = React.useRef(buildActivityDocument(activity, pages))

  React.useEffect(() => {
    createLearningPreview({ activity_uuid: activity.activity_uuid, document: documentRef.current, source: 'editor' }, accessToken)
      .then((created) => setToken(created.token))
      .catch((error: any) => {
        setMessage(error?.message || 'Could not start the preview.')
        setProblems(Array.isArray(error?.detail?.errors) ? error.detail.errors : null)
      })
  }, [activity.activity_uuid, accessToken])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Activity preview">
      {token ? (
        <ActivityPreview token={token} onClose={onClose} />
      ) : (
        <div className="m-auto w-full max-w-md rounded-2xl bg-white p-6 text-zinc-900 shadow-2xl">
          <div className="flex items-start gap-3">
            {message ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-bold">{message || 'Preparing preview…'}</p>
              {problems?.length ? (
                <ul className="mt-3 space-y-1.5 text-sm text-zinc-600">
                  {problems.map((problem) => (
                    <li key={`${problem.path}-${problem.message}`}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{problem.path}</code> {problem.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
