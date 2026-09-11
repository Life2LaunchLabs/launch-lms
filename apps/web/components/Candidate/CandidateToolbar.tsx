'use client'

import React, { useEffect, useState } from 'react'
import { ChatCircleDots, Megaphone, Sparkle, Warning } from '@phosphor-icons/react'
import { Badge } from '@components/ui/badge'
import { CandidateAnnouncement, candidateConfiguration, getCandidateAnnouncements, getCandidateFeedback, getCandidateReleases } from '@services/candidate/candidate'
import type { CandidatePanel } from '@components/Objects/Modals/FeedbackModal'

export default function CandidateToolbar({ accessToken, orgId, activePanel, onOpen, onConfiguration, onUnreadAnnouncements }: {
  accessToken?: string
  orgId?: number
  activePanel?: CandidatePanel | null
  onOpen: React.Dispatch<CandidatePanel>
  onConfiguration?: React.Dispatch<{ feedbackConfigured: boolean; unstable: boolean }>
  onUnreadAnnouncements?: React.Dispatch<CandidateAnnouncement[]>
}) {
  const [visible, setVisible] = useState(false)
  const [unread, setUnread] = useState({ announcements: 0, releases: 0, feedback: 0 })

  useEffect(() => {
    if (!accessToken) return
    let active = true
    candidateConfiguration(accessToken).then(async (config) => {
      if (!active) return
      setVisible(config.unstable)
      onConfiguration?.({ feedbackConfigured: config.feedback_configured, unstable: config.unstable })
      if (config.unstable) {
        const [releaseResult, announcementResult, feedbackResult] = await Promise.allSettled([
          getCandidateReleases(accessToken), getCandidateAnnouncements(accessToken),
          orgId && config.feedback_configured ? getCandidateFeedback(orgId, accessToken) : Promise.resolve([]),
        ])
        if (!active) return
        const releases = releaseResult.status === 'fulfilled' ? releaseResult.value : null
        const announcements = announcementResult.status === 'fulfilled' ? announcementResult.value : null
        const feedback = feedbackResult.status === 'fulfilled' ? feedbackResult.value : []
        setUnread({ announcements: announcements?.unread.length || 0, releases: releases?.unseen.length || 0, feedback: feedback.filter((item) => item.has_unread).length })
        if (announcements?.unread.length) onUnreadAnnouncements?.(announcements.unread)
      }
    }).catch(() => setVisible(false))
    return () => { active = false }
  }, [accessToken, onConfiguration, onUnreadAnnouncements, orgId])

  useEffect(() => {
    const clear = (event: Event) => {
      const detail = (event as CustomEvent<'announcements' | 'releases' | 'feedback' | { stream: 'announcements' | 'releases' | 'feedback'; value: number }>).detail
      const stream = typeof detail === 'string' ? detail : detail.stream
      const value = typeof detail === 'string' ? 0 : detail.value
      setUnread((current) => ({ ...current, [stream]: value }))
    }
    window.addEventListener('candidate-stream-viewed', clear)
    return () => window.removeEventListener('candidate-stream-viewed', clear)
  }, [])

  if (!visible) return null
  const actionClass = (panel: CandidatePanel) => `relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${activePanel === panel ? 'bg-amber-300 text-amber-950' : 'hover:bg-amber-200/60'}`
  return <div className="flex min-h-12 w-full items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-3 text-amber-950 dark:border-amber-300/25 dark:bg-[#211c10] dark:text-amber-100 sm:px-5">
    <div className="flex min-w-0 items-center gap-2"><Badge className="shrink-0 border-0 bg-amber-400 text-[10px] uppercase tracking-wide text-amber-950 hover:bg-amber-400"><Warning weight="fill" className="mr-1" />Unstable</Badge><span className="hidden truncate text-xs text-amber-900/70 md:inline dark:text-amber-100/60">Testing build — data may reset</span></div>
    <div className="flex items-center gap-1">
      <button type="button" aria-expanded={activePanel === 'announcements'} onClick={() => onOpen('announcements')} className={actionClass('announcements')}><Megaphone /> <span className="hidden sm:inline">Announcements</span>{unread.announcements ? <UnreadCount value={unread.announcements} /> : null}</button>
      <button type="button" aria-expanded={activePanel === 'releases'} onClick={() => onOpen('releases')} className={actionClass('releases')} aria-label={unread.releases ? `What's new, ${unread.releases} unread` : "What's new"}><Sparkle /> <span className="hidden sm:inline">What&apos;s new</span>{unread.releases ? <UnreadCount value={unread.releases} /> : null}</button>
      <button type="button" aria-expanded={activePanel === 'feedback'} onClick={() => onOpen('feedback')} className={actionClass('feedback')}><ChatCircleDots /> <span className="hidden sm:inline">Feedback</span>{unread.feedback ? <UnreadCount value={unread.feedback} /> : null}</button>
    </div>
  </div>
}

function UnreadCount({ value }: { value: number }) {
  return <span className="ml-0.5 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white" aria-label={`${value} unread`}>{value > 99 ? '99+' : value}</span>
}
