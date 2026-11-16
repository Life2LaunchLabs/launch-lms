'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { buildActivityDocument, createLearningPreview } from '@services/learning/activityDocuments'
import { ActivityPreview, type PreviewEvent } from './ActivityPreview'

// Previews exactly what is on screen in the editor (including edits that are
// still autosaving) through the same preview session and player used by
// shared preview links and the Claude connector. Without pages it previews the
// activity as saved, as staff do to try one before their learners get to it.
// The backdrop is the theme's own page color, so the preview reads right in light and dark.
export const PREVIEW_SCRIM_CLASS = 'bg-background/95 text-foreground backdrop-blur-sm'
// It renders on <body> at the modal layer: inside the editor it sat in the page's stacking
// context, under the admin's sticky phone top bar, which hid its Close and Restart.
export const PREVIEW_LAYER_CLASS = 'fixed inset-0 z-[var(--z-modal)]'

// `inline` keeps it where it is rendered instead: inside another dialog (a plan's Preview), a layer on
// <body> counts as outside that dialog, which takes its clicks and focus away.
// eslint-disable-next-line no-unused-vars
export function EditorPreviewModal({ activity, pages, accessToken, onClose, onEvent, inline = false }: { activity: any; pages?: any[]; accessToken?: string; onClose: () => void; onEvent?: (event: PreviewEvent) => void; inline?: boolean }) {
  const [token, setToken] = React.useState<string | null>(null)
  const [problems, setProblems] = React.useState<Array<{ path: string; message: string }> | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const documentRef = React.useRef(pages ? buildActivityDocument(activity, pages) : undefined)

  React.useEffect(() => {
    createLearningPreview({ activity_uuid: activity.activity_uuid, document: documentRef.current, source: documentRef.current ? 'editor' : 'link' }, accessToken)
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

  const dialog = (
    <div className={`${PREVIEW_LAYER_CLASS} flex flex-col p-4 sm:p-6 ${PREVIEW_SCRIM_CLASS}`} role="dialog" aria-modal="true" aria-label="Activity preview">
      {token ? (
        <ActivityPreview token={token} onClose={onClose} onEvent={onEvent} />
      ) : (
        <div className="m-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
          <div className="flex items-start gap-3">
            {message ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-bold">{message || 'Preparing preview…'}</p>
              {problems?.length ? (
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {problems.map((problem) => (
                    <li key={`${problem.path}-${problem.message}`}>
                      <code className="rounded bg-muted px-1 text-xs">{problem.path}</code> {problem.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
  // Opened only from a click, so there is always a document; the server render (tests) stays inline.
  return inline || typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)
}
