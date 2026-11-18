'use client'

import React from 'react'
import { ArrowSquareOut } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getCanvasTabTicket } from '@services/canvas/canvas'
import { useInCanvas } from '@services/canvas/frame'

const TAB_NAME = 'life2launch-from-canvas'

/** Opens the page the person is on in a tab of our own, signed in, without a token in any URL: a named tab
 *  opens at once (so the browser allows it), then a form posts a 60-second ticket into it. */
async function openInNewTab(orgId: number, token?: string) {
  const tab = window.open('about:blank', TAB_NAME)
  try {
    const path = `${window.location.pathname}${window.location.search}`
    const { ticket } = await getCanvasTabTicket(orgId, path, token)
    const form = document.createElement('form')
    form.method = 'post'
    form.action = `${window.location.origin}/api/v1/lti/session`
    form.target = TAB_NAME
    for (const [name, value] of Object.entries({ ticket, mode: 'tab' })) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
    form.remove()
  } catch (error: any) {
    tab?.close()
    toast.error(error?.message || 'Couldn’t open a new tab. Try again.')
  }
}

/** Inside Canvas: marks the page for the slimmer layout and keeps "Open in new tab" in reach (DEV-174). */
export default function CanvasFrame() {
  const inCanvas = useInCanvas()
  const org = useOrg() as any
  const session = useLHSession() as any
  const [opening, setOpening] = React.useState(false)

  React.useEffect(() => {
    if (!inCanvas) return
    document.documentElement.dataset.inCanvas = 'true'
    return () => { delete document.documentElement.dataset.inCanvas }
  }, [inCanvas])

  if (!inCanvas || session?.status !== 'authenticated' || !org?.id) return null
  const open = async () => {
    setOpening(true)
    await openInNewTab(Number(org.id), session?.data?.tokens?.access_token)
    setOpening(false)
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      aria-label="Open in new tab"
      title="Open in new tab"
      className="canvas-new-tab fixed right-3 top-3 z-[60] md:bottom-4 md:right-4 md:top-auto inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-border bg-card text-xs font-semibold md:w-auto md:px-3 text-foreground shadow-md transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--org-primary-color)] disabled:opacity-60 print:hidden"
    >
      <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
      <span className="hidden md:inline">{opening ? 'Opening…' : 'Open in new tab'}</span>
    </button>
  )
}
