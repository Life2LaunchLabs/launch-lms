'use client'

import { ActivityPreview, type PreviewEvent } from '@components/Learning/player/ActivityPreview'

// Message envelope read by the Claude connector's inline preview shell.
export const PREVIEW_MESSAGE_TYPE = 'launch-lms-preview'

export default function ActivityPreviewPage({ token, embedded }: { token: string; embedded: boolean }) {
  const relay = (event: PreviewEvent) => {
    if (!embedded || typeof window === 'undefined' || window.parent === window) return
    // The preview content belongs to the admin viewing it, so any embedding
    // origin may receive these events; nothing private beyond the preview leaves.
    window.parent.postMessage({ type: PREVIEW_MESSAGE_TYPE, event }, '*')
  }

  return (
    <main className={`${embedded ? 'h-dvh bg-zinc-100 p-2' : 'h-dvh bg-zinc-950 p-4 sm:p-6'} flex flex-col`}>
      <ActivityPreview token={token} onEvent={relay} allowFeedback={embedded} dark={!embedded} />
    </main>
  )
}
