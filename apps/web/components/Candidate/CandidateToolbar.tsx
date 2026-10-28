'use client'

import React, { useEffect, useState } from 'react'
import { Megaphone, Warning } from '@phosphor-icons/react'
import { Badge } from '@components/ui/badge'
import { CandidateAnnouncement, candidateConfiguration, getCandidateAnnouncements } from '@services/candidate/candidate'
import type { CandidatePanel } from '@components/Objects/Modals/FeedbackModal'

export default function CandidateToolbar({ accessToken, activePanel, onOpen, onConfiguration, onUnreadAnnouncements }: {
  accessToken?: string
  activePanel?: CandidatePanel | null
  onOpen: React.Dispatch<CandidatePanel>
  onConfiguration?: React.Dispatch<{ feedbackConfigured: boolean; unstable: boolean }>
  onUnreadAnnouncements?: React.Dispatch<CandidateAnnouncement[]>
}) {
  const [visible, setVisible] = useState(false)
  const [unread, setUnread] = useState({ announcements: 0, releases: 0 })

  useEffect(() => {
    if (!accessToken) return
    let active = true
    candidateConfiguration(accessToken).then(async (config) => {
      if (!active) return
      setVisible(config.unstable)
      onConfiguration?.({ feedbackConfigured: config.feedback_configured, unstable: config.unstable })
      if (config.unstable) {
        const announcements = await getCandidateAnnouncements(accessToken).catch(() => null)
        if (!active) return
        setUnread({ announcements: announcements?.unread.length || 0, releases: 0 })
        if (announcements?.unread.length) onUnreadAnnouncements?.(announcements.unread)
      }
    }).catch(() => setVisible(false))
    return () => { active = false }
  }, [accessToken, onConfiguration, onUnreadAnnouncements])

  useEffect(() => {
    const clear = (event: Event) => {
      const detail = (event as CustomEvent<'announcements' | 'releases' | 'feedback' | { stream: 'announcements' | 'releases' | 'feedback'; value: number }>).detail
      const stream = typeof detail === 'string' ? detail : detail.stream
      const value = typeof detail === 'string' ? 0 : detail.value
      if (stream === 'feedback') return
      setUnread((current) => ({ ...current, [stream]: value }))
    }
    window.addEventListener('candidate-stream-viewed', clear)
    return () => window.removeEventListener('candidate-stream-viewed', clear)
  }, [])

  if (!visible) return null
  const actionClass = (panel: CandidatePanel) => `relative flex h-9 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${activePanel === panel ? 'bg-amber-300 text-amber-950' : 'hover:bg-amber-200/60'}`
  return <div className="flex min-h-12 w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden border-b border-amber-300 bg-amber-50 px-3 text-amber-950 dark:border-amber-300/25 dark:bg-[#211c10] dark:text-amber-300 sm:px-5">
    <div className="flex min-w-0 items-center gap-2"><Badge className="shrink-0 border-0 bg-amber-400 text-[10px] uppercase tracking-wide text-amber-950 hover:bg-amber-400"><Warning weight="fill" className="mr-1" />Unstable</Badge><span className="hidden truncate text-xs text-amber-900/70 md:inline dark:text-amber-300/70">Testing build — data may reset</span></div>
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <button type="button" aria-expanded={activePanel === 'announcements'} onClick={() => onOpen('announcements')} className={actionClass('announcements')} aria-label={unread.announcements ? `Announcements, ${unread.announcements} unread` : 'Announcements'}><Megaphone /> <span className="hidden sm:inline">Announcements</span>{unread.announcements ? <UnreadCount value={unread.announcements} /> : null}</button>
    </div>
  </div>
}

function UnreadCount({ value }: { value: number }) {
  return <span className="ml-0.5 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white" aria-label={`${value} unread`}>{value > 99 ? '99+' : value}</span>
}
