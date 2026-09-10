'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PanelRightOpen } from 'lucide-react'
import { OrgMenu } from '@components/Objects/Menus/OrgMenu'
import { Button } from '@components/ui/button'
import { HubWorkspaceContext, type HubSurface } from '@components/Contexts/HubWorkspaceContext'
import HubExperience from '@/app/orgs/[orgslug]/(withmenu)/hub/HubExperience'
import { getUriWithOrg } from '@services/config/config'

/** The conversation is a stable sibling of routed content, never a page child or moving portal. */
export default function HubWorkspace({ children, orgslug }: { children: ReactNode; orgslug: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const router = useRouter()
  const full = /\/hub\/?$/.test(pathname)
  const [opened, setOpened] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [surface, setSurface] = useState<HubSurface | null>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const open = useCallback(() => setOpened(true), [])
  const visible = full || opened
  const currentSurface = surface?.path === pathname ? surface : null
  const filters = useMemo(() => full ? Object.fromEntries(search.entries()) : {}, [full, search])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1199px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

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

  const value = useMemo(() => ({ surface: currentSurface, setSurface, open, compact: opened && !full }), [currentSurface, open, opened, full])
  return <HubWorkspaceContext.Provider value={value}>
    <div className={`hub-workspace ${opened && !full ? 'hub-workspace--companion' : ''}`}>
      <div ref={appRef} className="hub-app-frame scrollbar-subtle scrollbar-subtle-rounded" hidden={full}>{children}</div>
      {!full && !opened && <Button ref={launcherRef} variant="secondary" onClick={open} className="hub-companion-launcher fixed bottom-24 right-4 z-[var(--z-nav)] gap-2 rounded-full shadow-md md:bottom-6" aria-label="Open Hub companion"><PanelRightOpen size={18} />Continue with Hub</Button>}
      {!full && opened && narrow && <button type="button" tabIndex={-1} className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/20" aria-label="Return to app" onClick={() => setOpened(false)} />}
      {full && <div className="print:hidden"><OrgMenu orgslug={orgslug} /></div>}
      <section ref={panelRef} tabIndex={-1} hidden={!visible} className={`hub-conversation-frame ${full ? 'hub-conversation-frame--full' : ''}`} role={narrow && !full && opened ? 'dialog' : 'region'} aria-modal={narrow && !full && opened ? true : undefined} aria-label="Hub companion">
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
