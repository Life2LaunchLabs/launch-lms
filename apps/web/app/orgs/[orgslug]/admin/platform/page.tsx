'use client'
import React from 'react'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import PlatformOverview from '@components/Admin/Platform/PlatformOverview'

export default function PlatformOverviewPage() {
  return (
    <PlatformShell title="Overview" activeSection="overview">
      <PlatformOverview />
    </PlatformShell>
  )
}
