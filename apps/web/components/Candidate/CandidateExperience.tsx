'use client'

import React, { useCallback, useEffect, useState } from 'react'
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

  const show = (next: CandidatePanel) => {
    if (next === 'announcements') setUnreadAnnouncements([])
    setPanel(next); setOpen((current) => current && panel === next ? false : true)
  }
  const configure = useCallback((configuration: { feedbackConfigured: boolean; unstable: boolean }) => {
    setFeedbackConfigured(configuration.feedbackConfigured)
    setUnstable(configuration.unstable)
  }, [])

  useEffect(() => {
    const listener = (event: Event) => {
      setPanel((event as CustomEvent<CandidatePanel>).detail || 'feedback')
      setOpen(true)
    }
    window.addEventListener(CANDIDATE_OPEN_EVENT, listener)
    return () => window.removeEventListener(CANDIDATE_OPEN_EVENT, listener)
  }, [])

  useEffect(() => { if (pathname) recordCandidateRoute(pathname) }, [pathname])
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

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
  return <div className="relative z-overlay w-full shrink-0 print:hidden">
    <CandidateToolbar accessToken={token} orgId={Number(org?.id)} activePanel={open ? panel : null} onConfiguration={configure} onOpen={show} onUnreadAnnouncements={receiveUnreadAnnouncements} />
    {currentAnnouncement && !open ? <section aria-live="polite" aria-label="Unread tester announcement" className="absolute right-3 top-full z-overlay mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-200 bg-background p-4 shadow-2xl"><p className="text-xs font-black uppercase tracking-wide text-amber-700">Announcement</p><h2 className="mt-1 font-bold">{currentAnnouncement.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{currentAnnouncement.message}</p><Button className="mt-4 w-full" size="sm" onClick={() => setUnreadAnnouncements((items) => items.slice(1))}>{unreadAnnouncements.length > 1 ? 'Next' : 'Done'}</Button></section> : null}
    {open && unstable ? <>
      <button type="button" aria-label="Close unstable panel" onClick={() => setOpen(false)} className="fixed inset-0 top-12 z-0 bg-black/15" />
      <section aria-label={`${panel} panel`} className={`fixed inset-x-0 bottom-0 z-10 max-h-[82dvh] overflow-y-auto rounded-t-2xl border border-b-0 border-amber-200 bg-background p-4 shadow-2xl sm:absolute sm:bottom-auto sm:left-auto sm:right-4 sm:top-full sm:mt-2 sm:w-[min(42rem,calc(100vw-2rem))] sm:rounded-2xl sm:border sm:p-5 ${theme === 'dark' ? 'dark border-white/10 bg-[#0f0f10]' : ''}`}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold capitalize">{panel === 'releases' ? "What's new" : panel}</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close panel" className="rounded-lg p-2 hover:bg-muted"><X /></button></div>
        <CandidatePanelContent panel={panel} theme={theme} orgId={Number(org?.id)} accessToken={token} feedbackConfigured={feedbackConfigured} onReleasesViewed={() => window.dispatchEvent(new Event('candidate-releases-viewed'))} />
      </section>
    </> : null}
  </div>
}
