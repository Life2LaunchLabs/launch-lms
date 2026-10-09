'use client'

import React from 'react'
import CandidateFeedbackQueue from '@components/Admin/CandidateFeedbackQueue'
import PlatformShell from '@components/Admin/Platform/PlatformShell'

export default function PlatformFeedbackPage() {
  return <PlatformShell title="Tester feedback" activeSection="feedback"><CandidateFeedbackQueue /></PlatformShell>
}
