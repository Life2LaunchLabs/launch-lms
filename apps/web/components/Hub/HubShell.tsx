'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sparkle } from '@phosphor-icons/react'
import { usePageTitle } from '@components/Contexts/PageTitleContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import type { HubEditOperation, HubEditRun } from '@services/hub/advisor'
import type { Resource } from '@services/resources/resources'
import { HubContext, type HubCoachIntent, type HubCoachState, type HubContextValue, type HubEditContinuation, type HubEditReviewItem, type HubSurface } from './HubContext'
import HubConversation from './conversation/HubConversation'
import useHubGestures from './useHubGestures'
import './hub.css'

const PHONE = '(max-width: 767px)'

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const MIN_WIDTH = 320
const MAX_WIDTH = 720
const PAGE_MIN = 560

/** The query parameters other pages (and the old /hub and /coach URLs) use to hand something to Coach. */
export const HUB_INTENT_PARAMS = { open: 'coach', conversation: 'coach_conversation', prompt: 'coach_prompt', resource: 'coach_resource' } as const
/** Links shared before the rename to Coach still use the ``hub`` names. */
const LEGACY_INTENT_PARAMS = { open: 'hub', conversation: 'hub_conversation', prompt: 'hub_prompt', resource: 'hub_resource' } as const

/**
 * The learner app's frame: navigation and Coach sit on an outside surface, the page is a
 * card on it. Coach is open (page aside or narrowed), at the edge (page back, Coach's edge
 * still showing because a conversation exists), or closed. The conversation is one
 * stable instance beside the routed page, so navigating never interrupts it.
 */
export default function HubShell({ children, orgslug, orgId }: { children: ReactNode; orgslug: string; orgId?: number }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const pageTitle = usePageTitle()
  const session = useLHSession() as any
  const userId = session?.data?.user?.id
  const setPageTitle = pageTitle?.setPageTitle
  const storageKey = `launchlms:hub-coach:${orgId || orgslug}:${userId || 'signed-out'}`
  const continuationStorageKey = `launchlms:hub-edit-continuation:${orgslug}:${userId || 'signed-out'}`
  const shellRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [state, setState] = useState<HubCoachState>('closed')
  const [started, setStarted] = useState(false)
  const [unread, setUnread] = useState(false)
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
  const [frozenY, setFrozenY] = useState<number | null>(null)
  const [intent, setIntent] = useState<(HubCoachIntent & { id: number }) | null>(null)
  const [endSignal, setEndSignal] = useState(0)
  const [width, setWidth] = useState(400)
  const [surface, setSurface] = useState<HubSurface | null>(null)
  const [editRun, setEditRun] = useState<HubEditRun | null>(null)
  const [editOperations, setEditOperations] = useState<HubEditOperation[]>([])
  const [editReviewItems, setEditReviewItems] = useState<HubEditReviewItem[]>([])
  const [editContinuations, setEditContinuations] = useState<HubEditContinuation[]>([])
  const currentSurface = surface?.path === pathname ? surface : null

  // Restore where Coach was for this session and this learner.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey) as HubCoachState | null
      // Browser storage is only readable after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === 'open' || stored === 'edge') setState(stored === 'open' && window.matchMedia(PHONE).matches ? 'edge' : stored)
    } catch { /* Coach starts closed without storage */ }
  }, [storageKey])
  useEffect(() => { try { window.sessionStorage.setItem(storageKey, state) } catch { /* optional */ } }, [state, storageKey])


  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem('launchlms:hub-companion-width'))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(stored) && stored >= MIN_WIDTH) setWidth(Math.min(stored, MAX_WIDTH))
    } catch { /* the default width is fine */ }
  }, [])

  const open = useCallback((next?: HubCoachIntent) => {
    // On phones the page freezes in place as a card while Coach is out; remember where it was scrolled.
    if (window.matchMedia(PHONE).matches) setFrozenY((current) => current ?? window.scrollY)
    setState('open')
    setUnread(false)
    if (next && (next.prompt || next.conversation || next.resource)) setIntent({ ...next, id: Date.now() })
  }, [])
  const tuck = useCallback(() => setState((current) => current === 'closed' ? current : started ? 'edge' : 'closed'), [started])
  const end = useCallback(() => { setEndSignal((value) => value + 1); setState('closed'); setUnread(false) }, [])
  const toggle = useCallback(() => (state === 'open' ? tuck() : open()), [open, state, tuck])
  const attach = useCallback((resource: Resource) => open({ resource: resource.resource_uuid }), [open])
  const onReply = useCallback(() => setUnread((current) => current || state !== 'open'), [state])

  // Other pages and old links hand work to Coach through the URL; take it once and tidy the URL.
  useEffect(() => {
    const names = search.get(HUB_INTENT_PARAMS.open) === 'open' ? HUB_INTENT_PARAMS : search.get(LEGACY_INTENT_PARAMS.open) === 'open' ? LEGACY_INTENT_PARAMS : null
    if (!names) return
    // The URL is the external source here: a link asked for Coach, so bring it out once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    open({ conversation: search.get(names.conversation) || undefined, prompt: search.get(names.prompt) || undefined, resource: search.get(names.resource) || undefined })
    const next = new URLSearchParams(search.toString())
    ;[...Object.values(HUB_INTENT_PARAMS), ...Object.values(LEGACY_INTENT_PARAMS)].forEach((key) => next.delete(key))
    window.history.replaceState({}, '', `${pathname}${next.size ? `?${next}` : ''}`)
  }, [open, pathname, search])

  // Once the page has slid back, let it scroll normally again from where it was.
  useEffect(() => {
    if (state === 'open' || frozenY === null) return
    const y = frozenY
    const timer = window.setTimeout(() => { setFrozenY(null); window.requestAnimationFrame(() => window.scrollTo({ top: y })) }, 420)
    return () => window.clearTimeout(timer)
  }, [state, frozenY])

  useHubGestures({ enabled: phone, state, shellRef, onOpen: open, onTuck: tuck })

  // The page slid aside on a phone is out of reach; keep it out of the focus order too.
  useEffect(() => {
    const page = shellRef.current?.querySelector<HTMLElement>('.learner-page')
    if (!page || !phone || state !== 'open') return
    page.inert = true
    return () => { page.inert = false }
  }, [phone, state])

  useEffect(() => {
    if (state !== 'open') return
    panelRef.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && panelRef.current?.contains(document.activeElement)) { event.preventDefault(); tuck() }
    }
    document.addEventListener('keydown', keys)
    return () => document.removeEventListener('keydown', keys)
  }, [state, tuck])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); toggle() }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [toggle])

  useEffect(() => {
    if (!currentSurface) return
    const section = /\/plans(?:\/|$)/.test(pathname) ? 'Plans' : currentSurface.label
    const detail = currentSurface.label === section ? undefined : currentSurface.label
    setPageTitle?.({ path: pathname, section, detail })
    return () => setPageTitle?.(null)
  }, [currentSurface, pathname, setPageTitle])

  // Proposal reviews queue messages back into the editing session; they survive a reload.
  useEffect(() => {
    if (!userId) return
    try {
      const stored = window.sessionStorage.getItem(continuationStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEditContinuations((Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item?.id && item?.conversationUuid && item?.runUuid && item?.content))
      }
    } catch { /* continuations still run without storage */ }
  }, [continuationStorageKey, userId])
  // eslint-disable-next-line no-unused-vars
  const storeContinuations = useCallback((change: (current: HubEditContinuation[]) => HubEditContinuation[]) => {
    setEditContinuations((current) => {
      const resolved = change(current)
      try {
        if (resolved.length) window.sessionStorage.setItem(continuationStorageKey, JSON.stringify(resolved))
        else window.sessionStorage.removeItem(continuationStorageKey)
      } catch { /* in-memory delivery remains */ }
      return resolved
    })
  }, [continuationStorageKey])
  const enqueueEditContinuation = useCallback((item: HubEditContinuation) => storeContinuations((current) => current.some((existing) => existing.id === item.id) ? current : [...current, item]), [storeContinuations])
  const removeEditContinuation = useCallback((id: string) => storeContinuations((current) => current.filter((item) => item.id !== id)), [storeContinuations])
  const clearEditContinuations = useCallback((runUuid?: string) => storeContinuations((current) => runUuid ? current.filter((item) => item.runUuid !== runUuid) : []), [storeContinuations])

  const beginResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const maximum = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - PAGE_MIN))
    const move = (moveEvent: PointerEvent) => setWidth(Math.max(MIN_WIDTH, Math.min(maximum(), window.innerWidth - moveEvent.clientX - 12)))
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      document.body.classList.remove('hub-resizing')
      const settled = Math.max(MIN_WIDTH, Math.min(maximum(), window.innerWidth - upEvent.clientX - 12))
      setWidth(settled)
      try { window.localStorage.setItem('launchlms:hub-companion-width', String(settled)) } catch { /* optional */ }
    }
    document.body.classList.add('hub-resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }, [])

  const value = useMemo<HubContextValue>(() => ({
    surface: currentSurface, setSurface, state, open, tuck, toggle, end, unread, attach,
    editRun, setEditRun, editOperations, setEditOperations, editReviewItems, setEditReviewItems,
    editContinuations, enqueueEditContinuation, removeEditContinuation, clearEditContinuations,
  }), [currentSurface, state, open, tuck, toggle, end, unread, attach, editRun, editOperations, editReviewItems, editContinuations, enqueueEditContinuation, removeEditContinuation, clearEditContinuations])

  const showEdge = state === 'edge' && started
  const style = { '--hub-width': `${width}px`, '--hub-frozen-y': `${-(frozenY || 0)}px` } as CSSProperties
  return <HubContext.Provider value={value}>
    <div ref={shellRef} className="hub-shell" data-hub-state={state} data-hub-edge={showEdge || undefined} data-hub-frozen={frozenY !== null || undefined} style={style}>
      {children}
      {state === 'open' && phone ? <button type="button" data-hub-page-strip className="hub-page-strip" aria-label="Back to the page" onClick={tuck} /> : null}
      {showEdge ? <button type="button" data-hub-edge className="hub-edge" aria-label={unread ? 'Open Coach, new reply' : 'Open Coach'} onClick={() => open()}>
        <span className={`hub-edge-dot ${unread ? 'hub-edge-dot--unread' : ''}`} aria-hidden="true" />
        <Sparkle size={18} weight="fill" className="hub-edge-mark" aria-hidden="true" />
        <span className="hub-edge-grip" aria-hidden="true" />
      </button> : null}
      {state === 'open' && !phone ? <div role="separator" aria-label="Resize Coach" aria-orientation="vertical" tabIndex={0} className="hub-resizer" onPointerDown={beginResize} onKeyDown={(event) => { const delta = event.key === 'ArrowLeft' ? 24 : event.key === 'ArrowRight' ? -24 : 0; if (!delta) return; event.preventDefault(); setWidth((current) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, current + delta))) }}><span /></div> : null}
      <section ref={panelRef} tabIndex={-1} className="hub-panel" aria-label="Coach" aria-hidden={state !== 'open' || undefined} inert={state !== 'open' || undefined}>
        <HubConversation orgslug={orgslug} active={state === 'open'} intent={intent} onIntentConsumed={() => setIntent(null)} endSignal={endSignal} onStartedChange={setStarted} onReply={onReply} />
      </section>
    </div>
  </HubContext.Provider>
}
