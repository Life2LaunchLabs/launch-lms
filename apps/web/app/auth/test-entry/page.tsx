'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { redeemLoginLink } from '@services/userTests/userTests'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { getUriWithOrg } from '@services/config/config'

/** Spends a one-use login link an admin made in Platform › User tests, then goes to its page. */
function TestEntryInner() {
  const searchParams = useSearchParams()
  // Read once: the address bar is cleared below, which updates the search params.
  const [ticket] = useState(() => searchParams.get('t'))
  const [failure, setError] = useState('')
  const ended = searchParams.get('ended') === '1'
  const dropped = searchParams.get('dropped') === '1'
  const error = ticket || failure ? failure
    : searchParams.get('closed') === '1' ? 'This test run has ended, so the persona is signed out.'
      : dropped ? 'The persona was signed out before its test run ended (the site may have restarted). Open the persona again from User tests to carry on.'
      : ended ? 'This test session could not move to that site. Open the persona again from User tests.'
      : 'This login link is incomplete. Make a new one in User tests.'
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !ticket) return
    started.current = true
    // Drop the ticket from the address bar and history before anything else.
    window.history.replaceState(null, '', '/auth/test-entry')
    redeemLoginLink(ticket)
      .then((result) => {
        // An org's admin lands on that org's own site, with the persona's session carried there.
        const path = result.target_path || '/'
        window.location.replace(result.target_org_slug ? authenticatedOrgHref(getUriWithOrg(result.target_org_slug, path), true) : path)
      })
      .catch((failure) => setError((failure as Error).message || 'This login link did not work.'))
  }, [ticket])

  return <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
    <div className="max-w-md text-center">
      {error ? <>
        <h1 className="mb-2 text-xl font-semibold text-gray-800">{searchParams.get('closed') === '1' || dropped ? 'Signed out' : ended ? 'Test session ended' : 'This test login link did not work'}</h1>
        <p role="alert" className="text-gray-600">{error}</p>
      </> : <p role="status" className="text-gray-600">Opening the test persona…</p>}
    </div>
  </main>
}

export default function TestEntryPage() {
  return <Suspense fallback={null}><TestEntryInner /></Suspense>
}
