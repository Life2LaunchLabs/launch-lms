'use client'

import React, { useEffect, useState } from 'react'
import { ChatCircleDots, Info, Sparkle, Warning } from '@phosphor-icons/react'
import { Badge } from '@components/ui/badge'
import { candidateConfiguration, getCandidateReleases } from '@services/candidate/candidate'
import type { CandidatePanel } from '@components/Objects/Modals/FeedbackModal'

export default function CandidateToolbar({ accessToken, onOpen, onConfiguration }: {
  accessToken?: string
  onOpen: React.Dispatch<CandidatePanel>
  onConfiguration?: React.Dispatch<{ feedbackConfigured: boolean; unstable: boolean }>
}) {
  const [visible, setVisible] = useState(false)
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    let active = true
    candidateConfiguration(accessToken).then(async (config) => {
      if (!active) return
      setVisible(config.unstable)
      onConfiguration?.({ feedbackConfigured: config.feedback_configured, unstable: config.unstable })
      if (config.unstable) {
        const releases = await getCandidateReleases(accessToken)
        if (active) setUnread(releases.has_unread)
      }
    }).catch(() => setVisible(false))
    return () => { active = false }
  }, [accessToken, onConfiguration])

  useEffect(() => {
    const clear = () => setUnread(false)
    window.addEventListener('candidate-releases-viewed', clear)
    return () => window.removeEventListener('candidate-releases-viewed', clear)
  }, [])

  if (!visible) return null
  return <div className="fixed right-3 top-3 z-overlay flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/95 p-1 text-amber-950 shadow-lg backdrop-blur dark:border-amber-300/25 dark:bg-[#211c10]/95 dark:text-amber-100">
    <Badge className="border-0 bg-amber-400 text-[10px] uppercase tracking-wide text-amber-950 hover:bg-amber-400"><Warning weight="fill" className="mr-1" />Unstable</Badge>
    <button type="button" onClick={() => onOpen('releases')} className="relative flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-amber-200/60" aria-label={unread ? "What's new, unread updates" : "What's new"}><Sparkle /> <span className="hidden sm:inline">What&apos;s new</span>{unread ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-amber-50 bg-red-500" /> : null}</button>
    <button type="button" onClick={() => onOpen('feedback')} className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-amber-200/60"><ChatCircleDots /> <span className="hidden sm:inline">Feedback</span></button>
    <button type="button" onClick={() => onOpen('about')} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-amber-200/60" aria-label="About this unstable preview"><Info /></button>
  </div>
}
