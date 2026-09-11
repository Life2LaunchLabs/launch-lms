'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import CandidateToolbar from './CandidateToolbar'
import { CandidatePanel, FeedbackModal } from '@components/Objects/Modals/FeedbackModal'

export const CANDIDATE_OPEN_EVENT = 'launchlms-candidate-open'

export function openCandidatePanel(panel: CandidatePanel = 'feedback') {
  window.dispatchEvent(new CustomEvent(CANDIDATE_OPEN_EVENT, { detail: panel }))
}

export default function CandidateExperience({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<CandidatePanel>('feedback')
  const [feedbackConfigured, setFeedbackConfigured] = useState(true)
  const [unstable, setUnstable] = useState(false)

  const show = (next: CandidatePanel) => { setPanel(next); setOpen(true) }
  const configure = useCallback((configuration: { feedbackConfigured: boolean; unstable: boolean }) => {
    setFeedbackConfigured(configuration.feedbackConfigured)
    setUnstable(configuration.unstable)
  }, [])

  useEffect(() => {
    const listener = (event: Event) => show((event as CustomEvent<CandidatePanel>).detail || 'feedback')
    window.addEventListener(CANDIDATE_OPEN_EVENT, listener)
    return () => window.removeEventListener(CANDIDATE_OPEN_EVENT, listener)
  }, [])

  if (session?.status !== 'authenticated') return null
  return <>
    <CandidateToolbar accessToken={token} onConfiguration={configure} onOpen={show} />
    <FeedbackModal open={open} onOpenChange={setOpen} theme={theme} orgId={Number(org?.id)} accessToken={token} initialPanel={panel} feedbackConfigured={feedbackConfigured} unstable={unstable} onReleasesViewed={() => window.dispatchEvent(new Event('candidate-releases-viewed'))} />
  </>
}
