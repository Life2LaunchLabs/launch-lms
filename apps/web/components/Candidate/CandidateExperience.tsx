'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from '@phosphor-icons/react'
import { Button } from '@components/ui/button'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import CandidateToolbar from './CandidateToolbar'
import { CandidatePanel, CandidatePanelContent, recordCandidateRoute } from '@components/Objects/Modals/FeedbackModal'
import { CandidateAnnouncement, markCandidateAnnouncementsViewed } from '@services/candidate/candidate'

export const CANDIDATE_OPEN_EVENT = 'launchlms-candidate-open'

export function openCandidatePanel(panel: CandidatePanel = 'feedback') {
  window.dispatchEvent(new CustomEvent(CANDIDATE_OPEN_EVENT, { detail: panel }))
}

export default function CandidateExperience({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<CandidatePanel>('feedback')
  const [feedbackConfigured, setFeedbackConfigured] = useState(true)
  const [unstable, setUnstable] = useState(false)
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<CandidateAnnouncement[]>([])
  const panelRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const show = (next: CandidatePanel) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    if (next === 'announcements') setUnreadAnnouncements([])
    setPanel(next); setOpen((current) => current && panel === next ? false : true)
  }
  const closePanel = useCallback(() => setOpen(false), [])
  const configure = useCallback((configuration: { feedbackConfigured: boolean; unstable: boolean }) => {
    setFeedbackConfigured(configuration.feedbackConfigured)
    setUnstable(configuration.unstable)
  }, [])

  useEffect(() => {
    const listener = (event: Event) => {
      returnFocusRef.current = document.activeElement as HTMLElement | null
      setPanel((event as CustomEvent<CandidatePanel>).detail || 'feedback')
      setOpen(true)
    }
    window.addEventListener(CANDIDATE_OPEN_EVENT, listener)
    return () => window.removeEventListener(CANDIDATE_OPEN_EVENT, listener)
  }, [])

  useEffect(() => { if (pathname) recordCandidateRoute(pathname) }, [pathname])
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePanel(); return }
      if (event.key !== 'Tab' || !panelRef.current?.contains(event.target as Node)) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter((element) => element.getClientRects().length)
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
    }
  }, [closePanel, open])

  const receiveUnreadAnnouncements = useCallback((items: CandidateAnnouncement[]) => {
    setUnreadAnnouncements((current) => current.length ? current : items)
  }, [])
  const currentAnnouncement = unreadAnnouncements[0]
  useEffect(() => {
    if (!currentAnnouncement || !token) return
    void markCandidateAnnouncementsViewed([currentAnnouncement.id], token).then(() => {
      window.dispatchEvent(new CustomEvent('candidate-stream-viewed', { detail: { stream: 'announcements', value: Math.max(0, unreadAnnouncements.length - 1) } }))
    }).catch(() => undefined)
  }, [currentAnnouncement, token, unreadAnnouncements.length])

  if (session?.status !== 'authenticated') return null
  return <div className="relative w-full min-w-0 max-w-full shrink-0 print:hidden" style={{ zIndex: 'var(--z-overlay)' }}>
    <CandidateToolbar accessToken={token} orgId={Number(org?.id)} activePanel={open ? panel : null} onConfiguration={configure} onOpen={show} onUnreadAnnouncements={receiveUnreadAnnouncements} />
    {currentAnnouncement && !open ? <section aria-live="polite" aria-label="Unread tester announcement" className="absolute right-3 top-full mt-2 w-[min(24rem,calc(100dvw-1.5rem))] rounded-2xl border border-amber-200 bg-background p-4 shadow-2xl" style={{ zIndex: 'var(--z-overlay)' }}><p className="text-xs font-black uppercase tracking-wide text-amber-700">Announcement</p><h2 className="mt-1 font-bold">{currentAnnouncement.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{currentAnnouncement.message}</p><Button className="mt-4 w-full" size="sm" onClick={() => setUnreadAnnouncements((items) => items.slice(1))}>{unreadAnnouncements.length > 1 ? 'Next' : 'Done'}</Button></section> : null}
    {open && unstable ? <>
      <button type="button" aria-label="Close unstable panel" onClick={closePanel} className="fixed inset-0 top-12 max-w-[100dvw] bg-black/15" style={{ zIndex: 'var(--z-modal-backdrop)' }} />
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${panel} panel`} className={`fixed inset-x-0 bottom-0 max-h-[82dvh] max-w-[100dvw] overflow-x-hidden overflow-y-auto rounded-t-2xl border border-b-0 border-amber-200 bg-background p-4 shadow-2xl outline-none sm:absolute sm:bottom-auto sm:left-auto sm:right-4 sm:top-full sm:mt-2 sm:w-[min(42rem,calc(100dvw-2rem))] sm:rounded-2xl sm:border sm:p-5 ${theme === 'dark' ? 'dark border-white/10' : ''}`} style={{ zIndex: 'var(--z-modal)', backgroundColor: theme === 'dark' ? '#0f0f10' : undefined }}>
        {panel !== 'feedback' ? <div className="mb-4 flex items-center justify-between"><h2 className="font-bold capitalize">{panel === 'releases' ? "What's new" : panel}</h2><button type="button" onClick={closePanel} aria-label="Close panel" className="rounded-lg p-2 hover:bg-muted"><X /></button></div> : null}
        <CandidatePanelContent panel={panel} theme={theme} orgId={Number(org?.id)} accessToken={token} feedbackConfigured={feedbackConfigured} onReleasesViewed={() => window.dispatchEvent(new Event('candidate-releases-viewed'))} />
      </section>
    </> : null}
  </div>
}
