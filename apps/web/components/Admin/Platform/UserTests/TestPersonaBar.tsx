'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { signOut } from '@components/Contexts/AuthContext'
import { fetchMyRun, readTestPersonaCookie } from '@services/userTests/userTests'

const PersonaPanel = dynamic(() => import('./PersonaPanel'), { ssr: false })

function clearMarker() {
  const expire = 'launchlms_test_persona=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  document.cookie = expire
  const parts = window.location.hostname.split('.')
  for (let index = 0; index < parts.length - 1; index += 1) {
    document.cookie = `${expire}; domain=.${parts.slice(index).join('.')}`
  }
}

/** A thin bar on every page while a test persona is signed in, so it is never mistaken for a real user. */
export default function TestPersonaBar() {
  const session = useLHSession() as { status?: string; data?: { user?: { id?: number } } } | undefined
  // Cookies have no change event; the session refreshing re-renders this often enough.
  const cookie = useSyncExternalStore(() => () => {}, () => document.cookie, () => '')
  const marker = readTestPersonaCookie(cookie)
  const [panel, setPanel] = useState(false)

  const userId = session?.data?.user?.id
  const active = Boolean(marker && userId && marker.userId === userId)
  // Shared with the panel. A 401 means the run closed (or the session ended): sign out, never show broken pages.
  const { data: run } = useSWR(active ? 'user_tests/me' : null, fetchMyRun, {
    refreshInterval: 30000,
    shouldRetryOnError: false,
    onError: (error: { status?: number }) => {
      if (error?.status !== 401) return
      clearMarker()
      void signOut({ callbackUrl: '/auth/test-entry?closed=1' })
    },
  })
  // The session ended on its own (a background refresh after the run closed): say so, not the org's login page.
  const ended = Boolean(marker && session?.status === 'unauthenticated')
  useEffect(() => {
    if (!ended) return
    clearMarker()
    if (!window.location.pathname.startsWith('/auth/test-entry')) window.location.replace('/auth/test-entry?closed=1')
  }, [ended])
  if (!marker || !userId) return null
  if (marker.userId !== userId) { clearMarker(); return null }
  return <div style={{ zIndex: 'var(--z-popover)' }} className="sticky top-0">
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-300 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
      <span>Test persona: {marker.name || 'unnamed'}{marker.cohort ? ` · ${marker.cohort}` : ''}</span>
      <button type="button" className="underline underline-offset-2" aria-expanded={panel} onClick={() => setPanel(!panel)}>My test run{run?.unread_mail ? ` (${run.unread_mail} new email)` : ''}</button>
      <button type="button" className="underline underline-offset-2" onClick={() => { clearMarker(); void signOut({ callbackUrl: '/auth/login' }) }}>Sign out</button>
    </div>
    {panel ? <PersonaPanel onClose={() => setPanel(false)} /> : null}
  </div>
}
