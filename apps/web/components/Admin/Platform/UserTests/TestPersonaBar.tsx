'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { signOut } from '@components/Contexts/AuthContext'
import { getConfig } from '@services/config/config'
import { testerSurfaceEnabled } from '@/lib/testerSurfaces'
import { fetchMyRun, fetchRunOpen, readTestPersonaCookie, switchPersona } from '@services/userTests/userTests'

const PersonaPanel = dynamic(() => import('./PersonaPanel'), {
  ssr: false,
  loading: () => <div role="status" className="absolute right-2 top-full mt-1 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-xl">Loading…</div>,
})

// A session can drop while the run is still open: a redeploy answers 5xx for a minute and the page
// loads signed out, though the refresh cookie still works. Saying "the run ended" then sent testers
// off for no reason (UT-3). So "ended" is said only when the run really closed; otherwise the page
// reloads a few times to let the site come back, and only then says the session dropped.
const RETRY_KEY = 'launchlms_test_persona_retries'
const RETRIES = 6
const RETRY_MS = 10000
// The bar's height, for the site's sticky and fixed headers to sit below it (DEV-127). Never set
// where user tests are off, so production headers stay at the top (DEV-27).
const BAR_HEIGHT_VAR = '--test-persona-bar-h'

/** Publishes the bar's height while it shows, so headers sit below it instead of under it. */
function useBarHeight(shown: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = ref.current
    const root = document.documentElement
    if (!shown || !bar) return
    const publish = () => root.style.setProperty(BAR_HEIGHT_VAR, `${bar.offsetHeight}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(bar)
    return () => { observer?.disconnect(); root.style.removeProperty(BAR_HEIGHT_VAR) }
  }, [shown])
  return ref
}

/** True when the run is closed, false when open, null when the site couldn't say (it may be restarting). */
async function runClosed(userId: number): Promise<boolean | null> {
  try { return !(await fetchRunOpen(userId)) } catch (failure) { return (failure as { status?: number })?.status === 404 ? true : null }
}

function retries(next?: number): number {
  try {
    if (next === undefined) return Number(window.sessionStorage.getItem(RETRY_KEY) || 0)
    if (next === 0) window.sessionStorage.removeItem(RETRY_KEY)
    else window.sessionStorage.setItem(RETRY_KEY, String(next))
    return next
  } catch { return RETRIES }
}

function clearMarker() {
  const expire = 'launchlms_test_persona=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  document.cookie = expire
  const parts = window.location.hostname.split('.')
  for (let index = 0; index < parts.length - 1; index += 1) {
    document.cookie = `${expire}; domain=.${parts.slice(index).join('.')}`
  }
}

/** A thin bar on every page while a test persona is signed in, so it is never mistaken for a real user.
 *  Renders nothing where user tests are off, which is every production site (DEV-27). */
export default function TestPersonaBar() {
  if (!testerSurfaceEnabled('userTests', getConfig)) return null
  return <ActiveTestPersonaBar />
}

function ActiveTestPersonaBar() {
  const session = useLHSession() as { status?: string; data?: { user?: { id?: number } } } | undefined
  // Cookies have no change event; the session refreshing re-renders this often enough.
  const cookie = useSyncExternalStore(() => () => {}, () => document.cookie, () => '')
  const marker = readTestPersonaCookie(cookie)
  const [panel, setPanel] = useState(false)

  const userId = session?.data?.user?.id
  const active = Boolean(marker && userId && marker.userId === userId)
  const barRef = useBarHeight(active)
  const markerUserId = marker?.userId
  // Shared with the panel. A 401 when the run closed: sign out, never show broken pages.
  const { data: run } = useSWR(active ? 'user_tests/me' : null, fetchMyRun, {
    refreshInterval: 30000,
    shouldRetryOnError: false,
    onError: (error: { status?: number }) => {
      if (error?.status !== 401 || !markerUserId) return
      void runClosed(markerUserId).then((closed) => {
        if (!closed) return  // still open: the session refresh sorts out the token, or the effect below takes over
        clearMarker()
        void signOut({ callbackUrl: '/auth/test-entry?closed=1' })
      })
    },
  })
  useEffect(() => { if (active) retries(0) }, [active])
  // The page loaded signed out while the marker says a persona was here: find out why before saying anything.
  const ended = Boolean(markerUserId && session?.status === 'unauthenticated')
  useEffect(() => {
    if (!ended || !markerUserId || window.location.pathname.startsWith('/auth/test-entry')) return
    let cancelled = false
    void runClosed(markerUserId).then((closed) => {
      if (cancelled) return
      const tried = retries()
      if (closed === false || closed === null) {
        if (tried < RETRIES) {
          retries(tried + 1)
          window.setTimeout(() => { if (!cancelled) window.location.reload() }, RETRY_MS)
          return
        }
      }
      retries(0)
      clearMarker()
      window.location.replace(closed ? '/auth/test-entry?closed=1' : '/auth/test-entry?dropped=1')
    })
    return () => { cancelled = true }
  }, [ended, markerUserId])
  async function switchTo(otherId: number) {
    if (!otherId) return
    try {
      const link = await switchPersona(otherId)
      clearMarker()
      // Sign this browser out here, then open the other persona's one-use link on the main site.
      void signOut({ callbackUrl: link.url || link.path })
    } catch (failure) { window.alert((failure as Error).message) }
  }
  if (!marker || !userId) return null
  if (marker.userId !== userId) { clearMarker(); return null }
  // Under every dialog and overlay (a full-screen one covers it, buttons and all), level with the site's
  // nav, which sits below it; above them only while its own panel is open (DEV-127).
  return <div style={{ zIndex: panel ? 'var(--z-popover)' : 'var(--z-nav)' }} className="sticky top-0">
    <div ref={barRef} role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-300 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
      <span>Test persona: {marker.name || 'unnamed'}{marker.cohort ? ` · ${marker.cohort}` : ''}</span>
      <button type="button" className="underline underline-offset-2" aria-expanded={panel} onClick={() => setPanel(!panel)}>My test run{run?.unread_mail ? ` (${run.unread_mail} new email)` : ''}</button>
      {run?.others?.length ? <label className="flex items-center gap-1">
        <span className="sr-only">Switch to another persona in this run</span>
        <select className="rounded bg-amber-200 px-1 py-0.5 text-xs font-semibold" value="" onChange={(event) => void switchTo(Number(event.target.value))}>
          <option value="">Switch to…</option>
          {run.others.map((other) => <option key={other.user_id} value={other.user_id}>{other.name}</option>)}
        </select>
      </label> : null}
      <button type="button" className="underline underline-offset-2" onClick={() => { clearMarker(); void signOut({ callbackUrl: '/auth/login' }) }}>Sign out</button>
    </div>
    {panel ? <PersonaPanel onClose={() => setPanel(false)} /> : null}
  </div>
}
