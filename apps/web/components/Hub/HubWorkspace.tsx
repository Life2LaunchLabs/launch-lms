'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PanelRightOpen } from 'lucide-react'
import { OrgMenu } from '@components/Objects/Menus/OrgMenu'
import { Button } from '@components/ui/button'
import { HubWorkspaceContext, type HubEditContinuation, type HubEditReviewItem, type HubSurface } from '@components/Contexts/HubWorkspaceContext'
import { usePageTitle } from '@components/Contexts/PageTitleContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import HubExperience from '@/app/orgs/[orgslug]/(withmenu)/hub/HubExperience'
import { getUriWithOrg } from '@services/config/config'
import type { HubEditOperation, HubEditRun } from '@services/hub/advisor'

/** The conversation is a stable sibling of routed content, never a page child or moving portal. */
export default function HubWorkspace({ children, orgslug }: { children: ReactNode; orgslug: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const router = useRouter()
  const pageTitle = usePageTitle()
  const session = useLHSession() as any
  const userId = session?.data?.user?.id
  const setPageTitle = pageTitle?.setPageTitle
  const full = /\/hub\/?$/.test(pathname)
  const [opened, setOpened] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [surface, setSurface] = useState<HubSurface | null>(null)
  const [editRun, setEditRun] = useState<HubEditRun | null>(null)
  const [editOperations, setEditOperations] = useState<HubEditOperation[]>([])
  const [editReviewItems, setEditReviewItems] = useState<HubEditReviewItem[]>([])
  const [editContinuations, setEditContinuations] = useState<HubEditContinuation[]>([])
  const [companionWidth, setCompanionWidth] = useState(420)
  const [resizeCollapsed, setResizeCollapsed] = useState(false)
  const continuationStorageKey = `launchlms:hub-edit-continuation:${orgslug}:${userId || 'signed-out'}`
  const appRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const open = useCallback(() => setOpened(true), [])
  const visible = full || opened
  const currentSurface = surface?.path === pathname ? surface : null
  const filters = useMemo(() => full ? Object.fromEntries(search.entries()) : {}, [full, search])

  useEffect(() => {
    if (!userId) return
    try {
      const stored = window.sessionStorage.getItem(continuationStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        setEditContinuations((Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item?.id && item?.conversationUuid && item?.runUuid && item?.content))
      }
    } catch { /* a continuation can still run without browser storage */ }
  }, [continuationStorageKey, userId])

  const storeEditContinuations = useCallback((change: (current: HubEditContinuation[]) => HubEditContinuation[]) => {
    setEditContinuations((current) => {
      const resolved = change(current)
      try {
        if (!userId) return resolved
        if (resolved.length) window.sessionStorage.setItem(continuationStorageKey, JSON.stringify(resolved))
        else window.sessionStorage.removeItem(continuationStorageKey)
      } catch { /* in-memory delivery remains available */ }
      return resolved
    })
  }, [continuationStorageKey, userId])
  const enqueueEditContinuation = useCallback((continuation: HubEditContinuation) => storeEditContinuations((current) => current.some((item) => item.id === continuation.id) ? current : [...current, continuation]), [storeEditContinuations])
  const removeEditContinuation = useCallback((id: string) => storeEditContinuations((current) => current.filter((item) => item.id !== id)), [storeEditContinuations])
  const clearEditContinuations = useCallback((runUuid?: string) => storeEditContinuations((current) => runUuid ? current.filter((item) => item.runUuid !== runUuid) : []), [storeEditContinuations])

  useEffect(() => {
    if (!currentSurface) return
    const section = /\/plans(?:\/|$)/.test(pathname) ? 'Plans' : currentSurface.label
    const detail = currentSurface.label === section ? undefined : currentSurface.label
    setPageTitle?.({ path: pathname, section, detail })
    return () => setPageTitle?.(null)
  }, [currentSurface, pathname, setPageTitle])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1199px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem('launchlms:hub-companion-width'))
      if (Number.isFinite(stored) && stored >= 280) setCompanionWidth(stored)
    } catch { /* the default width remains usable */ }
  }, [])

  useEffect(() => {
    if (narrow || full) return
    const constrain = () => {
      const maximum = Math.max(320, window.innerWidth - 28 - 14 - 768)
      setCompanionWidth((current) => Math.max(320, Math.min(current, maximum, 720)))
    }
    constrain()
    window.addEventListener('resize', constrain)
    return () => window.removeEventListener('resize', constrain)
  }, [full, narrow])

  const beginResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (narrow || full) return
    event.preventDefault()
    const resize = (clientX: number) => {
      const rawWidth = window.innerWidth - clientX - 14
      const maximum = Math.max(320, window.innerWidth - 28 - 14 - 768)
      setResizeCollapsed(rawWidth < 280)
      setCompanionWidth(Math.max(0, Math.min(rawWidth, maximum, 720)))
    }
    const move = (moveEvent: PointerEvent) => resize(moveEvent.clientX)
    const finish = (upEvent: PointerEvent) => {
      const rawWidth = window.innerWidth - upEvent.clientX - 14
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      document.body.classList.remove('hub-resizing')
      setResizeCollapsed(false)
      if (rawWidth < 280) {
        setOpened(false)
        return
      }
      const maximum = Math.max(320, window.innerWidth - 28 - 14 - 768)
      const settled = Math.max(320, Math.min(rawWidth, maximum, 720))
      setCompanionWidth(settled)
      try { window.localStorage.setItem('launchlms:hub-companion-width', String(settled)) } catch { /* persistence is optional */ }
    }
    document.body.classList.add('hub-resizing')
    resize(event.clientX)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }, [full, narrow])

  useEffect(() => {
    if (!narrow || !opened || full) return
    const app = appRef.current
    const previous = document.activeElement as HTMLElement | null
    if (app) app.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const keys = (event: KeyboardEvent) => {
      // Portalled product dialogs/menus own their own keyboard handling.
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); setOpened(false) }
      if (!panelRef.current?.contains(event.target as Node)) return
      if (event.key !== 'Tab') return
      const elements = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length)
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keys)
    return () => {
      if (app) app.inert = false
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keys)
      if (previous?.isConnected) previous.focus()
    }
  }, [narrow, opened, full])

  const value = useMemo(() => ({ surface: currentSurface, setSurface, open, compact: opened && !full, editRun, setEditRun, editOperations, setEditOperations, editReviewItems, setEditReviewItems, editContinuations, enqueueEditContinuation, removeEditContinuation, clearEditContinuations }), [currentSurface, open, opened, full, editRun, editOperations, editReviewItems, editContinuations, enqueueEditContinuation, removeEditContinuation, clearEditContinuations])
  return <HubWorkspaceContext.Provider value={value}>
    <div className={`hub-workspace ${opened && !full ? 'hub-workspace--companion' : ''}`}>
      <div ref={appRef} className="hub-app-frame scrollbar-subtle scrollbar-subtle-rounded" hidden={full}>{children}</div>
      {!full && !opened && <Button ref={launcherRef} variant="secondary" onClick={open} className="hub-companion-launcher fixed bottom-24 right-4 z-[var(--z-nav)] gap-2 rounded-full shadow-md md:bottom-6" aria-label="Open Hub companion"><PanelRightOpen size={18} />Continue with Hub</Button>}
      {!full && opened && narrow && <button type="button" tabIndex={-1} className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/20" aria-label="Return to app" onClick={() => setOpened(false)} />}
      {full && <div className="print:hidden"><OrgMenu orgslug={orgslug} /></div>}
      {!full && opened && !narrow ? <div role="separator" aria-label="Resize Hub companion" aria-orientation="vertical" tabIndex={0} className="hub-workspace-resizer" onPointerDown={beginResize} onKeyDown={(event) => { const delta = event.key === 'ArrowLeft' ? 24 : event.key === 'ArrowRight' ? -24 : 0; if (!delta) return; event.preventDefault(); const maximum = Math.max(320, window.innerWidth - 28 - 14 - 768); setCompanionWidth((current) => Math.max(320, Math.min(maximum, 720, current + delta))) }}><span /></div> : null}
      <section ref={panelRef} tabIndex={-1} hidden={!visible} style={!full && opened && !narrow ? { width: resizeCollapsed ? 0 : companionWidth, opacity: resizeCollapsed ? 0 : 1 } : undefined} className={`hub-conversation-frame ${full ? 'hub-conversation-frame--full' : ''}`} role={narrow && !full && opened ? 'dialog' : 'region'} aria-modal={narrow && !full && opened ? true : undefined} aria-label="Hub companion">
        <HubExperience
          orgslug={orgslug}
          filters={filters}
          companion={!full}
          visible={visible}
          onCompanionCollapse={() => setOpened(false)}
          onCompanionExpand={() => router.push(getUriWithOrg(orgslug, '/hub'))}
        />
      </section>
    </div>
  </HubWorkspaceContext.Provider>
}
